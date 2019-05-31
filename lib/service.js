'use strict'

const cpuStats = require('cpu-stats')
const os = require('os')
const EventEmitter = require('events').EventEmitter
const path = require('path')
const fs = require('fs')
const http = require('http')

const connect = require('connect')
const Rest = require('connect-rest')
const serveStatic = require('serve-static')
const bodyParser = require('body-parser')
const got = require('got')

const debug = require('debug')('iios:service')

const utils = require('./utils')
const ConnectorFactory = require('./connectors').ConnectorFactory
const IIOSAccesControl = require('./accesscontrol').IIOSAccesControl

/*
  Implements service, allows remote call and publish to discovery dico
*/
class Service extends EventEmitter {
  constructor(options) {
    super()

    this.uuid = Math.random().toString(36).slice(2)

    this._options = options || {}
    this._options.connector = this._options.connector || { redis: null }
    this._options.publicOptions = this._options.publicOptions || {}

    // activate PUB/SUB by default for remote call instead of using HTTP
    if (this._options.pubsubRPC === undefined) {
      this._options.pubsubRPC = true
    } else {
      if (this._options.pubsubRPC === 'false') {
        this._options.pubsubRPC = false
      } else {
        this._options.pubsubRPC = true
      }
    }

    debug('service instatiated with options %j', this._options)

    this._namespace = 'iios:' + (this._options.namespace || 'iios')
    this._libPackageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
    this._packageJson = this._libPackageJson

    // services list
    this._services = {}

    // permissions actions for methods if access controll
    this._permissionActions = {}

    // get version from service package.json (not lib's one)
    let servicePackagePath = path.join(process.cwd(), 'package.json')
    if (fs.existsSync(servicePackagePath)) {
      this._packageJson = JSON.parse(fs.readFileSync(servicePackagePath, 'utf8'))
    }

    this._listeners = {
      onIIOSEvent: this._onIIOSEvent.bind(this),
      onKey: this._onKey.bind(this),
      onKillSignal: this._killingMeSoftly.bind(this),
      onHeartBeat: this._onHeartBeat.bind(this)
    }

    if (!this._options.pubsubRPC) {
      debug('service in HTTP mode (no pub/sub RPC)')

      if (!this._options.discoveryServers) {
        debug('HTTP mode: no discovery servers: must die')
        process.exit(1)
      }
    } else {
      // default to first in the dico (normally unique)
      let connectorType = Object.keys(this._options.connector)[0] || 'redis'

      try {
        this._connector = (new ConnectorFactory())
          .getConnectorInstance(connectorType,
            this._options.connector[connectorType] || {
              host: '127.0.0.1',
              port: 6379,
              db: 0,
              ipFamily: 4
            })
      } catch (err) {
        debug('failed to get connector with error %o. exiting...', err)
        process.exit(1)
      }

      this._connector.subscribeKVEvents(this._namespace + ':*').then(() => {
        debug('subscribed KV events for pattern %s', this._namespace + ':*')
      }).catch(err => {
        debug('failed to subscribe KV events with error %o', err)
      })

      this._connector.subscribe(this._namespace + '__event', this._listeners.onIIOSEvent).then(() => {
        debug('subscribed IIOS events')
      }).catch(err => {
        debug('failed to subscribe IIOS events with error %o', err)
      })

      this._connector.on('key', this._listeners.onKey)

      // manage heartbeat
      if (this._options.heartbeatPeriod) {
        // service says that is starting
        this._emitHeartBeat({ message: 'service starting' }, 'starting')

        this._heartBeatInterval = setInterval(() => {
          cpuStats(this._options.heartbeatPeriod, (error, result) => {
            let hbData = {
              cpus: result,
              hostname: os.hostname(),
              err: error,
              version: this._packageJson.version,
              name: this._packageJson.name
            }

            this._emitHeartBeat(hbData)
          })
        }, this._options.heartbeatPeriod)
      }
    }

    this._name = this._options.name || this.uuid

    // catch signals for clean shutdown
    // => must catch signal to clean up connector/discovery
    process.on('SIGINT', this._listeners.onKillSignal)
    process.on('SIGTERM', this._listeners.onKillSignal)

    // methods that can be called remotely for this service
    this._methods = null

    // http callable lethods
    this._httpMethods = {
      get: [],
      post: [],
      put: [],
      delete: []
    }

    if (this._options.server) {
      this._serveHTTP().then(() => {
        debug('discovery host %s', this._options.server.host)
        debug('HTTP server ready at %s',
          JSON.stringify(this._httpServer.address()) + ':' +
          this._options.server.port + ' for ' + this._options.server.path)
      }).catch(err => {
        debug('failed to start HTTP server with error %o', err)
      })
    } else {
      debug('HTTP server is not configured and will not start')
    }
  }

  get name() {
    return this._name
  }

  /* ------------------------------------------------------------------------
     starts HTTP server
     ------------------------------------------------------------------------ */
  _serveHTTP() {
    return new Promise((resolve, reject) => {
      // declare HTTP server serving static files
      let path2serve = path.join(process.cwd(), this._options.server.path)

      this._httpApp = connect()
        .use(bodyParser.urlencoded({ extended: true }))
        .use(bodyParser.json())
        .use(serveStatic(path2serve, { 'index': [ 'index.html' ] }))

      // REST API manager: connect-rest context set to '/api'
      this._rest = Rest.create({
        context: '/api',
        logger: { level: 'error' }
      })

      // adds connect-rest middleware to connect
      this._httpApp.use(this._rest.processRequest())

      this._httpServer = new http.Server(this._httpApp)

      // start web server
      this._httpServer.listen(this._options.server.port, '0.0.0.0', err => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  /* ------------------------------------------------------------------------
     initializes and registers methods for remote calling
     -> call it only when everything is defined in the child class == methods
     ready for registration
     ------------------------------------------------------------------------ */
  _init() {
    return new Promise(async (resolve, reject) => {
      if (this._options.accesscontrol) {
        try {
          this._ac = new IIOSAccesControl(this._options.accesscontrol)
          await this._ac.init()
        } catch (err) {
          debug('failed to initialize accesscontrol with error %o', err)
        }
      }

      this._registerMethods().then(methods => {
        if (this._connector) {
          this._getAvailableNSServices().then(services => {
            this._services = services
            resolve()
          }).catch(err => reject(err))
        } else {
          resolve({})
        }
      }).catch(err => {
        reject(err)
        debug('failed to initialize with error %o', err)
        process.exit(1)
      })
    })
  }

  /* ------------------------------------------------------------------------
      processes IIOS event (push event)
     ------------------------------------------------------------------------ */
  _onIIOSEvent(event, message) {
    this.emit('iios:event', message)

    if (message.meta) {
      if (message.meta.service) {
        if (message.meta.origin !== this.uuid) {
          this.emit('iios:' + message.meta.service + ':event', message)
          this.emit('iios:' + message.meta.service + ':event:' +
            message.meta.event, message.payload)
        }
      }
    }
  }

  /* ------------------------------------------------------------------------
     called on heartbeat message received for current subscription
     ------------------------------------------------------------------------ */
  _onHeartBeat(pattern, channel, message) {
    if (message.meta && message.meta.origin !== this.uuid) {
      this.emit('heartbeat', message)
    }
  }

  /* ------------------------------------------------------------------------
     emits service push event (IIOS event)
     ------------------------------------------------------------------------ */
  _pushEvent(name, data) {
    return new Promise((resolve, reject) => {
      let message = {
        meta: {
          origin: this.uuid,
          event: name,
          service: this._name
        },
        data: data
      }

      if (this._connector) {
        this._connector.publish(this._namespace + '__event', message).then(() => {
          resolve()
        }).catch(err => {
          debug('failed to publish IIOS event with error %o', err)
          reject(err)
        })
      } else {
        debug('connector not available: using HTTP only push event not available')
        reject(new Error('connector not available'))
      }
    })
  }

  /* ------------------------------------------------------------------------
     called on service name event in the KV store
     ------------------------------------------------------------------------ */
  _onKey(key, operation) {
    try {
      let serviceShortName = key.replace(this._namespace + ':', '')
      if (!serviceShortName ||
        serviceShortName === '' || this._name === serviceShortName) return

      debug('key %s update with operation %s for service %s (registered %s)',
        key, operation, serviceShortName, !!this._services[serviceShortName])

      if (operation === 'set') {
        this._connector.get(key).then(service => {
          if (this._services[serviceShortName]) {
            if (utils.compareDates(this._services[serviceShortName].creationTimestamp,
              service.creationTimestamp) !== 1) {
              return
            }
          }

          this._services[serviceShortName] = service
          this.emit('service:up', serviceShortName, this._services[serviceShortName])
        })
      } else if (operation === 'del') {
        this.emit('service:down', serviceShortName)
      }
    } catch (err) {
      console.log(err)
    }
  }

  /* ------------------------------------------------------------------------
     get services already registered to discovery KV store
     ------------------------------------------------------------------------ */
  _getAvailableNSServices(namespace) {
    return new Promise((resolve, reject) => {
      let pattern = namespace ? namespace + ':*' : this._namespace + ':*'
      let services = {}

      if (this._connector) {
        this._connector.keys(pattern).then(keys => {
          if (keys && keys.length > 0) {
            this._connector.mget(keys).then(values => {
              for (let i = 0; i < values.length; i++) {
                let serviceShortName = keys[i].replace(this._namespace + ':', '')
                services[serviceShortName] = values[i]
                debug('service %s detected: %j', serviceShortName, services[serviceShortName])
              }

              resolve(services)
            }).catch(err => reject(err))
          } else {
            resolve(services)
          }
        }).catch(err => reject(err))
      } else {
        debug('connector not available: switch to HTTP discovery backup')
        resolve(this._services)
      }
    })
  }

  /* ------------------------------------------------------------------------
     register one method for remote call availability
     ------------------------------------------------------------------------ */
  _registerOneMethod(method) {
    return new Promise((resolve, reject) => {
      // register HTTP API call type (REST like)
      let lookup = this[method].toString().match(/@_(.*?)_/)
      let httpAPICallType

      if (!!lookup) {
        httpAPICallType = lookup[1].toLowerCase()
        if (['get', 'post', 'put', 'delete'].indexOf(httpAPICallType) === -1) {
          debug('%s is not an available HTTP call', httpAPICallType)
          return
        }

        if (this._httpMethods[httpAPICallType] &&
          Array.isArray(this._httpMethods[httpAPICallType])) {
          if (this._httpMethods[httpAPICallType].indexOf(method) === -1) {
            this._httpMethods[httpAPICallType].push(method)
          }

          // manage connect-rest delete implementation
          if (httpAPICallType === 'delete') {
            httpAPICallType = 'del'
          }

          if (typeof this._rest[httpAPICallType] === 'function') {
            let cb = async (request, content) => {
              let args = request.body

              if (httpAPICallType === 'del' && (!request.body ||
                JSON.stringify(request.body) === '{}')) {
                args = request.query
              } else if (!request.body || JSON.stringify(request.body) === '{}') {
                args = request.parameters
              }

              if (!Array.isArray(args)) {
                if (typeof args === 'object') {
                  let argv = []
                  for (let p in args) {
                    argv.push(args[p])
                  }

                  args = argv
                }
              }

              let userId = request.headers ? request.headers.userid : null

              if (this._options.accesscontrol) {
                let granted = (await this._ac.userPermission(userId,
                  this._name, this._permissionActions[method])).granted

                if (!granted) return { err: 'access not granted' }
              }

              try {
                args.push(userId)

                let result = (await this[method].apply(this, args)) ||
                  { status: 'ok' }
                return result
              } catch (err) {
                console.log(err)
                return { err: '' + err }
              }
            }

            this._rest[httpAPICallType]('/' + method, cb)
            debug('mounted HTTP API on %s for service %s method %s',
              httpAPICallType, this._name, method)
          } else {
            debug('%s is not an available HTTP call', httpAPICallType)
          }
        }
      } else {
        debug('method %s will not be exported to the HTTP API', method)
      }

      if (!this._options.pubsubRPC || !this._connector) {
        debug('connector not available: HTTP only mode')
        resolve(httpAPICallType)
        return
      }

      // subscribe to method related channel
      let channel = this._namespace + ':' + this._name + ':' + method

      // request callback
      let reqCallback = async (rqChannel, requestMsg) => {
        let responseChannel = rqChannel + ':' + requestMsg.meta.token

        if (this._options.accesscontrol) {
          let granted = (await this._ac.userPermission(requestMsg.meta.userId,
            this._name, this._permissionActions[method])).granted

          if (!granted) {
            let errMessage = {
              meta: {
                origin: this.uuid,
                token: requestMsg.meta.token
              },
              err: 'access not granted'
            }

            this._connector.publish(responseChannel, errMessage).then(() => {
              debug('access not granted response for channel', responseChannel)
            }).catch(err => {
              debug('failed to publish response for channel %s with error %o',
                responseChannel, err)
            })

            return
          }
        }

        // call service method
        requestMsg.req = requestMsg.req || []
        requestMsg.req.push(requestMsg.meta.userId)

        this[method].apply(this, requestMsg.req).then(response => {
          let responseMessage = {
            meta: {
              origin: this.uuid,
              token: requestMsg.meta.token,
              userId: requestMsg.meta.userId
            },
            response: response
          }

          this._connector.publish(responseChannel, responseMessage).then(() => {
            debug('published response for channel', responseChannel)
            resolve()
          }).catch(err => {
            debug('failed to publish response for channel %s with error %o',
              responseChannel, err)
          })
        }).catch(err => {
          let errMessage = {
            meta: {
              origin: this.uuid,
              token: requestMsg.token
            },
            err: '' + err
          }

          this._connector.publish(responseChannel, errMessage).then(() => {
            debug('published error response for channel', responseChannel)
          }).catch(err => {
            debug('failed to publish error response for channel %s with error %o',
              responseChannel, err)
          })
        })
      }

      this._connector.subscribe(channel, reqCallback).then(() => {
        resolve(httpAPICallType)
      }).catch(err => reject(err))
    })
  }

  /* ------------------------------------------------------------------------
     register public methods available from remote
     ------------------------------------------------------------------------ */
  _registerMethods() {
    return new Promise(async (resolve, reject) => {
      // reject if multiple register calls
      if (this._methods) {
        reject(new Error('methods registration already done'))
      }

      // automatically detects methods
      this._methods = utils.getMethods(this)

      for (let m of this._methods) {
        let httpAPICallType = await this._registerOneMethod(m)

        // build permissions actions for methods
        switch (httpAPICallType) {
          case 'get':
            this._permissionActions[m] = 'readAny'
            break
          case 'put':
            this._permissionActions[m] = 'createAny'
            break
          case 'post':
            this._permissionActions[m] = 'updateAny'
            break
          case 'del':
            this._permissionActions[m] = 'deleteAny'
            break
          default:
            this._permissionActions[m] = 'updateAny'
        }
      }

      // add service to local and remote dico
      let serviceDiscoveryInfo = {
        /* service name */
        name: this._name,
        /* service version */
        version: this._packageJson.version,
        /* IIOS services lib version */
        libVersion: this._libPackageJson.version,
        /* service's programming language */
        lang: 'js',
        /* pub/sub enabled or http only remote call */
        pubsubEnabled: this._options.pubsubRPC,
        /* service creation timestamp */
        creationTimestamp: Date.now(),
        /* list of remotely callable service's methods */
        methods: this._methods,
        /* HTTP callable  methods stored by call type (get, post, ...) */
        httpMethods: this._httpMethods,
        /* HTTP server connection info */
        httpServer: this._options.server,
        /* public options that can be viewed from browser clients as well */
        options: this._options.publicOptions
      }

      if (this._connector) {
        this._connector.set(this._namespace + ':' + this._name,
          serviceDiscoveryInfo)
          .then(() => {
            resolve(this._methods)
          }).catch(err => reject(err))
      } else {
        debug('connector not available: switch to HTTP registering')

        // if is gateway
        if (this._options.discoveryServers) {
          let counter = 0

          for (let server of this._options.discoveryServers) {
            try {
              let url = (server.protocol || 'http') + '://' + server.host +
                ':' + server.port + '/api'

              debug('will try to register to %s', url)

              await got('/register', {
                baseUrl: url,
                method: 'post',
                json: true,
                body: serviceDiscoveryInfo
              })

              counter++
            } catch (err) {
              debug('failed to register in HTTP mode on discovery server %o with error %o',
                server, err)
            }
          }

          if (counter > 0) {
            resolve(this._methods)
          } else {
            if (this._api) {
              resolve()
              debug('is gateway: no registering')
            } else {
              reject(new Error('failed to register in HTTP mode'))
            }
          }
        }
      }
    })
  }

  /* ------------------------------------------------------------------------
     subscribes to heartbeat event for a given namespace (default = current)
     ------------------------------------------------------------------------ */
  _subscribeHeartBeat(namespace) {
    return new Promise((resolve, reject) => {
      namespace = namespace || this._namespace
      let hPattern = 'iios:' + namespace + '__heartbeat'

      if (this._connector) {
        this._connector.psubscribe(hPattern, this._listeners.onHeartBeat)
          .then(subscriptionsInfo => {
            debug('subscribed heartbeat for pattern %s', hPattern)
            resolve(subscriptionsInfo)
          }).catch(err => reject(err))
      } else {
        debug('connector not available: hearbeat event not available')
        reject(new Error('connector not available'))
      }
    })
  }

  /* ------------------------------------------------------------------------
     unsubscribes to hearbeat event for a given namespace (default = current)
     ------------------------------------------------------------------------ */
  _unsubscribeHeartBeat(namespace) {
    return new Promise((resolve, reject) => {
      namespace = namespace || this._namespace
      let hPattern = 'iios:' + namespace + '__heartbeat'

      if (this._connector) {
        this._connector.punsubscribe(hPattern, this._listeners.onHeartBeat)
          .then(subscriptionsInfo => {
            resolve(subscriptionsInfo)
          }).catch(err => reject(err))
      } else {
        debug('connector not available: hearbeat event not available')
        reject(new Error('connector not available'))
      }
    })
  }

  /* ------------------------------------------------------------------------
     emits hearbeat event for current service
     ------------------------------------------------------------------------ */
  _emitHeartBeat(data = {}, status = 'alive') {
    if (this._connector) {
      let message = {
        meta: {
          origin: this.uuid,
          service: this._name,
          namespace: this._namespace,
          timestamp: Date.now(),
          status: status
        },
        data: data
      }

      this._connector.publish('iios:' + this._namespace + '__heartbeat', message).then(() => {
        debug('published heartbeat')
      }).catch(err => {
        debug('failed to publish heartbeat with error %o', err)
      })
    } else {
      debug('connector not available: hearbeat event not available')
    }
  }

  /* ------------------------------------------------------------------------
     destroy current service and its associated connector and server (clean up)
     ------------------------------------------------------------------------ */
  _destroy() {
    return new Promise(async (resolve, reject) => {
      try {
        try {
          process.off('SIGINT', this._listeners.onKillSignal)
          process.off('SIGTERM', this._listeners.onKillSignal)
        } catch (err) {
          debug('failed to remove SIG listeners')
        }

        if (this._connector) {
          if (this._options.heartbeatPeriod) {
            this._emitHeartBeat({ message: 'service destroy called' }, 'stopping')
            clearInterval(this._heartBeatInterval)
          }

          this._connector.del(this._namespace + ':' + this._name)
          await this._connector.destroy()
        }

        if (this._httpServer) {
          this._httpServer.close(() => {
            resolve()
          })
        } else {
          resolve()
        }
      } catch (err) {
        debug('destroy failed with error: %o', err)
        process.exit(1)
      }
    })
  }

  /* ------------------------------------------------------------------------
     to be called for destroy if message has to be displayed
     ------------------------------------------------------------------------ */
  _dying(msg, err) {
    return new Promise((resolve, reject) => {
      this._destroy().then(() => {
        // delay to let connector remove server data from redis
        setTimeout(() => {
          debug('dying: %s, %o', msg, err)
          process.exit(1)
        }, 500)
      }).catch(err => reject(err))
    })
  }

  /* ------------------------------------------------------------------------
     called on catching SIGTERM/SIGINT signal
     ------------------------------------------------------------------------ */
  _killingMeSoftly() {
    if (this._options.heartbeatPeriod) {
      this._emitHeartBeat({ message: 'SIGTERM/SIGINT received' }, 'stopping')
    }

    this._dying('diying on SIGTERM or SIGINT...')
  }
}

exports.Service = Service
