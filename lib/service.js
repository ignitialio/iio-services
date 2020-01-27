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
// HTTP encoding
const Encoders = require('./encoders')

const debug = require('debug')('iios:service')

const utils = require('./utils')
const ConnectorFactory = require('./connectors').ConnectorFactory
const IIOSAccesControl = require('./accesscontrol').IIOSAccesControl
const InputStream = require('./streams').InputStream
const OutputStream = require('./streams').OutputStream

/*
  Implements service, allows remote call and publish to discovery dico
*/
class Service extends EventEmitter {
  constructor(options) {
    super()

    this.uuid = utils.uuid()

    this._options = options || {}
    this._options.connector = this._options.connector || { redis: null }
    this._options.publicOptions = this._options.publicOptions || {}

    // activate KV store by default
    if (this._options.kvStoreMode === undefined) {
      this._options.kvStoreMode = true
    } else {
      if (this._options.kvStoreMode === 'false' || this._options.kvStoreMode === false) {
        this._options.kvStoreMode = false
      } else {
        this._options.kvStoreMode = true
      }
    }

    // activate HTTP RPC mode by default
    if (this._options.httpRPC === undefined) {
      this._options.httpRPC = true
    } else {
      if (this._options.httpRPC === 'false' || this._options.httpRPC === false) {
        this._options.httpRPC = false
      } else {
        this._options.httpRPC = true
      }
    }

    debug('service instatiated with options %j', this._options)

    this._namespace = 'iios:' + (this._options.namespace || 'iios')
    let libPackageJsonPath = path.join(__dirname, '../package.json')
    this._libPackageJson = JSON.parse(fs.readFileSync(libPackageJsonPath, 'utf8'))
    this._packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))

    // HTML data encoding
    let encoding = this._options.connector && this._options.connector.encoder
      ? this._options.connector.encoder : 'bson'
    this.encoder = Encoders[encoding]

    // services list
    this._services = {}

    // streaming triggers (indexed on local methods)
    this._triggerStreams = {}
    // methods triggers for outputs (indexed on local methods)
    this._outputTriggers = {}
    // events triggers (indexed on events)
    this._triggeredMethodsCallbacks = {}

    // methods presets: used for automatically fill in method arguments when
    // no one is provided. Ex: service used as source in workflow
    this._presets = {}

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
      onHeartBeat: this._onHeartBeat.bind(this),
      onError: this._onError.bind(this)
    }

    if (!this._options.kvStoreMode) {
      debug('service in HTTP mode (no push events)')

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
      this._connector.on('error', this._listeners.onError)

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

    // streams inputs/outputs
    this._streams = { in: {}, out: {} }

    if (this._options.server) {
      // normalize port
      this._options.server.port = parseInt(this._options.server.port)

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

  /* ------------------------------------------------------------------------
     name property getter
     ------------------------------------------------------------------------ */
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
        logger: { level: this._options.server.restLogLevel || 'error' }
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
     -> calls "beforeRegisteringFct" just before registering to KV -> must be
     async: optional
     ------------------------------------------------------------------------ */
  _init(beforeRegisteringFct) {
    return new Promise(async (resolve, reject) => {
      if (this._options.accesscontrol) {
        try {
          this._ac = new IIOSAccesControl(this._options.accesscontrol)

          if (this._options.accesscontrol.grants) {
            for (let role in this._options.accesscontrol.grants) {
              let grants = this._options.accesscontrol.grants[role]
              await this._updateGrants(role, grants)
            }

            console.log('--WARNING-- self grants update done by service --')
          }

          await this._ac.init()
        } catch (err) {
          this._dying('failed to create access controller. exiting...', err)
        }
      }

      // must be async
      if (beforeRegisteringFct) {
        await beforeRegisteringFct()
      }

      this._registerMethods().then(methods => {
        if (this._connector) {
          this._getAvailableNSServices().then(services => {
            if (services) {
              delete services[this._name]
              this._services = services
            }
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
      processes connector errors
     ------------------------------------------------------------------------ */
  _onError(err) {
    debug('' + err)
  }

  /* ------------------------------------------------------------------------
      processes IIOS event (push event)
     ------------------------------------------------------------------------ */
  _onIIOSEvent(event, message) {
    this.emit('iios:event', message)

    if (message.meta) {
      if (message.meta.service) {
        if (message.meta.origin !== this.uuid) {
          this.emit('iios:' + message.meta.service + ':event', message, message.meta.grants)
          this.emit('iios:' + message.meta.service + ':event:' +
            message.meta.event, message.payload, message.meta.grants)
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
  _pushEvent(name, data, grants) {
    return new Promise((resolve, reject) => {
      let message = {
        meta: {
          origin: this.uuid,
          event: name,
          service: this._name,
          grants: grants
        },
        payload: data
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
      debug('failed to process key update from KV server with error %o', err)
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

      // get call type from external update: eg. dlake
      for (let ht in this._httpMethods) {
        if (this._httpMethods[ht].indexOf(method) !== -1) {
          httpAPICallType = ht
          break
        }
      }

      // force HTTP call type to 'post' if info is missing
      httpAPICallType = httpAPICallType || (lookup ? lookup[1].toLowerCase() : 'post')

      if (['get', 'post', 'put', 'delete'].indexOf(httpAPICallType) === -1) {
        debug('%s is not an available HTTP call: force to POST', httpAPICallType)
        httpAPICallType = 'post'
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

        if (this._options.server && this._rest) {
          if (typeof this._rest[httpAPICallType] === 'function') {
            let cb = async (request, content) => {
              try {
                let args =
                  this.encoder.unpack(Buffer.from(request.body.rq, 'base64')).args

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

                // Trace RPC calls if flag enabled
                if (process.env.IIOS_TRACE_RPC) {
                  console.log(new Date().toISOString(), '--TRACERPC--HTTP--REQUEST--',
                    this._namespace + ':' + this._name + ':' + method, JSON.stringify(args))
                }

                let userId = request.headers ? request.headers.userid : null
                let grants
                let grantsAny

                if (this._options.accesscontrol) {
                  try {
                    if (request.headers && request.headers.privileged) {
                      // user access control overpassed: web app/front end api gateways
                      // cannot use this way.
                      // privilege mode has a role base access control anyway: role must
                      // be defined with corresponding grants, either access not granted
                      grants = this._ac.rolePermission('__privileged__',
                        this._name, this._permissionActions[method])

                      grantsAny = this._ac.rolePermission('__privileged__',
                        this._name, this._permissionActions[method].replace('Own', 'Any'))
                    } else {
                      grants = await this._ac.userPermission(userId,
                        this._name, this._permissionActions[method])

                      grantsAny = await this._ac.userPermission(userId,
                        this._name, this._permissionActions[method].replace('Own', 'Any'))
                    }
                  } catch (err) {
                    debug('failed to get access grants with error %o', err)
                    return {
                      err: 'access not granted: service [' +
                        this._name + '], method [' + method + '], user [' +
                        userId + '], privileged [' +
                        (request.headers && request.headers.privileged) + ']'
                    }
                  }

                  if (!grants.granted) {
                    return {
                      err: 'access not granted: service [' +
                        this._name + '], method [' + method + '], user [' +
                        userId + '], privileged [' +
                        (request.headers && request.headers.privileged) + ']'
                    }
                  }
                }

                try {
                  args.push({
                    $userId: userId || null,
                    $grants: grants,
                    $grantsAny: grantsAny
                  })

                  let result = (await this[method].apply(this, args)) ||
                    { status: 'ok' }

                  // Trace RPC calls if flag enabled
                  if (process.env.IIOS_TRACE_RPC) {
                    console.log(new Date().toISOString(), '--TRACERPC--HTTP--RESPONSE--',
                      this._namespace + ':' + this._name + ':' + method, JSON.stringify(result))
                  }

                  // emit output events if flag enabled
                  if (process.env.IIOS_OUTPUT_EVENTS) {
                    this.emit('__output:' + method, result)
                  }

                  return { result: this.encoder.pack({ result: result }) }
                } catch (err) {
                  debug('failed to execute method with error', err)

                  // Trace RPC calls if flag enabled
                  if (process.env.IIOS_TRACE_RPC) {
                    console.log(new Date().toISOString(), '--TRACERPC--HTTP--ERROR--',
                      this._namespace + ':' + this._name + ':' + method, JSON.stringify(err))
                  }

                  return { err: '' + err, stack: (err ? err.stack : undefined) }
                }
              } catch (err) {
                console.log('-------------------', err)
                return {
                  err: err.toString()
                }
              }
            }

            this._rest[httpAPICallType]('/' + method, cb)
            debug('mounted HTTP API on %s for service %s method %s',
              httpAPICallType, this._name, method)
          } else {
            debug('%s is not an available HTTP call', httpAPICallType)
          }
        } else {
          debug('%s is not an available HTTP call since not server defined', httpAPICallType)
        }
      }

      if (!this._options.kvStoreMode || this._options.httpRPC || !this._connector) {
        debug('connector not available or HTTP RPC mode with or without KV store')
        resolve(httpAPICallType)
        return
      }

      // subscribe to method related channel
      let channel = this._namespace + ':' + this._name + ':' + method

      // request callback
      let reqCallback = async (rqChannel, requestMsg) => {
        let responseChannel = rqChannel + ':' + requestMsg.meta.token

        // Trace RPC calls if flag enabled
        if (process.env.IIOS_TRACE_RPC) {
          console.log(new Date().toISOString(), '--TRACERPC--RPC--REQUEST--', channel, JSON.stringify(requestMsg))
        }

        let grants
        let grantsAny

        if (this._options.accesscontrol) {
          try {
            if (requestMsg.meta.privileged) {
              // user access control overpassed: web app/front end api gateways
              // cannot use this way.
              // privilege mode has a role base access control anyway: role must
              // be defined with corresponding grants, either access not granted
              grants = this._ac.rolePermission('__privileged__',
                this._name, this._permissionActions[method])

              grantsAny = this._ac.rolePermission('__privileged__',
                this._name, this._permissionActions[method].replace('Own', 'Any'))
            } else {
              // normal case: user access control
              grants = await this._ac.userPermission(requestMsg.meta.userId,
                this._name, this._permissionActions[method])

              grantsAny = await this._ac.userPermission(requestMsg.meta.userId,
                this._name, this._permissionActions[method].replace('Own', 'Any'))
            }
          } catch (err) {
            debug('failed to get access grants with error %o', err)
          }

          if (!grants || !grants.granted) {
            let errMessage = {
              meta: {
                origin: this.uuid,
                token: requestMsg.meta.token
              },
              err: 'access not granted: service [' +
                this._name + '], method [' + method + '], user [' +
                requestMsg.meta.userId + '], privileged [' +
                requestMsg.meta.privileged + ']'
            }

            // Trace RPC calls if flag enabled
            if (process.env.IIOS_TRACE_RPC) {
              console.log(new Date().toISOString(), '--TRACERPC--RPC--ERROR--', channel, JSON.stringify(errMessage))
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
        requestMsg.req.push({
          $userId: requestMsg.meta.userId || null,
          $grants: grants,
          $grantsAny: grantsAny
        })

        try {
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

            // Trace RPC calls if flag enabled
            if (process.env.IIOS_TRACE_RPC) {
              console.log(new Date().toISOString(), '--TRACERPC--RPC--RESPONSE--', channel, JSON.stringify(responseMessage))
            }

            // emit output events if flag enabled
            if (process.env.IIOS_OUTPUT_EVENTS) {
              this.emit('__output:' + method, response)
            }
          }).catch(err => {
            let errMessage = {
              meta: {
                origin: this.uuid,
                token: requestMsg.meta.token
              },
              err: '' + err,
              stack: (err ? err.stack : undefined)
            }

            // Trace RPC calls if flag enabled
            if (process.env.IIOS_TRACE_RPC) {
              console.log(new Date().toISOString(), '--TRACERPC--RPC--ERROR--', channel, JSON.stringify(errMessage))
            }

            this._connector.publish(responseChannel, errMessage).then(() => {
              debug('published error response for channel', responseChannel)
            }).catch(err => {
              debug('failed to publish error response for channel %s with error %o',
                responseChannel, err)
            })
          })
        } catch (err) {
          let errMessage = {
            meta: {
              origin: this.uuid,
              token: requestMsg.meta.token
            },
            err: '' + err,
            stack: (err ? err.stack : undefined)
          }

          this._connector.publish(responseChannel, errMessage).then(() => {
            debug('published error response for channel', responseChannel)
          }).catch(err => {
            debug('failed to publish error response for channel %s with error %o',
              responseChannel, err)
          })
        }
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
        //   Own matches Any => OK for services
        //   => recheck for data
        switch (httpAPICallType) {
          case 'get':
            this._permissionActions[m] = 'readOwn'
            break
          case 'put':
            this._permissionActions[m] = 'createOwn'
            break
          case 'post':
            this._permissionActions[m] = 'updateOwn'
            break
          case 'del':
            this._permissionActions[m] = 'deleteOwn'
            break
          default:
            this._permissionActions[m] = 'updateOwn'
        }
      }

      // add service to local and remote dico
      let serviceDiscoveryInfo = {
        /* service name */
        name: this._name,
        /* service version */
        version: this._packageJson.version,
        /* IIOS services lib version */
        iiosLibVersion: this._libPackageJson.version,
        /* service's programming language */
        lang: 'js',
        /* pub/sub enabled or http only remote call */
        pubsubRPCEnabled: !this._options.httpRPC,
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
     add input/output stream
     ------------------------------------------------------------------------ */
  _addStream(name, destination, options) {
    try {
      let stream = null

      if (destination) {
        stream = new InputStream(this._connector, destination, {
          name: name,
          namespace: this._namespace,
          ...options
        })

        this._streams.in[stream.name] = stream

        debug('input stream %s created for destination %s', stream.name, destination)
      } else {
        stream = new OutputStream(this._connector, {
          name: name,
          namespace: this._namespace,
          ...options
        })

        this._streams.out[stream.name] = stream

        debug('output stream %s created', stream.name)
      }

      return stream
    } catch (err) {
      debug('failed to add stream with error %o', err)

      return null
    }
  }

  /* ------------------------------------------------------------------------
     remove input/output stream
     ------------------------------------------------------------------------ */
  _removeStream(name) {
    for (let ins in this._streams) {
      if (ins === name) {
        this._streams.in[name].destroy()
        delete this._streams.in[name]
        return name
      }
    }

    for (let outs in this._streams) {
      if (outs === name) {
        this._streams.out[name].destroy()
        delete this._streams.out[name]
        return name
      }
    }

    return null
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

        // destroy streams
        for (let ins in this._streams.in) {
          this._streams.in[ins].destroy()
        }

        for (let outs in this._streams.out) {
          this._streams.out[outs].destroy()
        }

        // destroy access control
        if (this._ac) {
          try {
            await this._ac.destroy()
          } catch (err) {
            debug('failed to destroy access control')
          }
        }

        // destroy connector
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
      }).catch(lerr => reject(lerr))
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

  /* ------------------------------------------------------------------------
     update grants
     ------------------------------------------------------------------------ */
  _updateGrants(role, grants) {
    return new Promise(async (resolve, reject) => {
      if (!this._ac) {
        reject(new Error('service has not access control'))
        return
      }

      if (!role) {
        reject(new Error('missing role'))
        return
      }

      try {
        let roleData = await this._ac.getGrants(role)
        roleData = roleData || {}

        // deletes only if indicates null
        if (grants === null) {
          delete roleData[this._name]
        } else {
          // MERGE with existing: DOES NOT OVERWRITE
          roleData[this._name] = { ...roleData[this._name], ...grants }
        }

        await this._ac.setGrants(role, roleData)
        debug('update grants for role %s', role)

        await this._ac.syncGrants()

        resolve(this._name)
      } catch (err) {
        reject(err)
      }
    })
  }

  /* bind input stream to local method */
  bindStreamToMethod(streamId, method) {
    return new Promise((resolve, reject) => {
      try {
        // binds local input stream to external output stream given as parameter
        this._triggerStreams[method] =
          this._addStream('stream:' + this._name + ':method:' + method, streamId)

        this._triggerStreams[method].on('data', data => {
          this[method](data).catch(err => {
            debug(err)
          })
        })

        this._triggerStreams[method].on('end', () => {
          debug('end of stream [%s] detected', 'stream:' +
            this._name + ':method:' + method)
        })
        resolve()
      } catch (err) {
        reject(err)
      }
    })
  }

  /* unbind input stream from local method */
  unbindStreamFromMethod(streamId, method) {
    return new Promise((resolve, reject) => {
      try {
        this._triggerStreams[method].destroy()
        this._removeStream('stream:' + this._name + ':method:' + method)
        this._triggerStreams[method] = undefined
        resolve()
      } catch (err) {
        reject(err)
      }
    })
  }

  /* bind trig event to local method */
  bindEventToMethod(event, method) {
    return new Promise((resolve, reject) => {
      try {
        this._triggeredMethodsCallbacks[event] = (data, grants) => {
          this[method](data, grants).catch(err => debug(err))
        }

        this.on(event, this._triggeredMethodsCallbacks[event])
        resolve()
      } catch (err) {
        reject(err)
      }
    })
  }

  /* bind trig event to local method */
  bindServiceEventToMethod(service, event, method) {
    return new Promise((resolve, reject) => {
      try {
        let eventName = 'iios:' + service + ':event:' + event
        this._triggeredMethodsCallbacks[eventName] = (data, grants) => {
          this[method](data, grants).catch(err => debug(err))
        }

        this.on(eventName, this._triggeredMethodsCallbacks[eventName])
        resolve()
      } catch (err) {
        reject(err)
      }
    })
  }

  /* unbind trig event from local method */
  unbindEventFromMethod(event, method) {
    return new Promise((resolve, reject) => {
      try {
        this.off(event, this._triggeredMethodsCallbacks[event])
        this._triggeredMethodsCallbacks[event] = undefined
        resolve()
      } catch (err) {
        reject(err)
      }
    })
  }

  /* unbind trig event from local method */
  unbindServiceEventFromMethod(service, event, method) {
    return new Promise((resolve, reject) => {
      try {
        let eventName = 'iios:' + service + ':event:' + event
        this.off(eventName, this._triggeredMethodsCallbacks[eventName])
        this._triggeredMethodsCallbacks[eventName] = undefined
        resolve()
      } catch (err) {
        reject(err)
      }
    })
  }

  /* set a method as an output, which means that it trigs an IIO event for each
     method execution, which allows another service to bind to that one */
  setMethodAsOutput(method, grants) {
    return new Promise((resolve, reject) => {
      this._outputTriggers[method] = result => {
        // WARNING: here grants are those of the setter
        this._pushEvent('output:' + method, result, grants)
      }

      this.on('__output:' + method, this._outputTriggers[method])

      resolve()
    })
  }

  /* unset a method as an output */
  unsetMethodAsOutput(method) {
    return new Promise((resolve, reject) => {
      this.off('__output:' + method, this._outputTriggers[method])
      this._outputTriggers[method] = undefined
      resolve()
    })
  }

  /* allow another service to call a method without parameters: if method is a
    data source, then no need to have parameters. If not, call tries to bind the
    method to a third service method call and so on. However, services cannot do
    so (they need to be gateways for that), then, in this specific case, call is
    done with no parameters
    when preset args exist for method, they are used for the call
  */
  callEventuallyBoundMethod(method, grants) {
    if (this[method]) {
      if (this._presets[method]) {
        let args = this._presets[method].concat([ grants ])
        return this[method].apply(this, args)
      } else {
        return this[method](grants)
      }
    } else {
      return new Promise((resolve, reject) => reject(new Error('method does not exist')))
    }
  }

  /* preset method arguments: use in order to set a source with a given
    configuration. In this case, a given method will use preset args
    each time it is called with no args. The behaviour has to be explicitely
    defined service side, even if info is stored trough the base class call.
    "args" must be an array (list of args)  */
  presetMethodArgs(method, args) {
    return new Promise((resolve, reject) => {
      this._presets[method] = args
      resolve()
    })
  }

  /* get method presets */
  getMethodParamsPresets(method) {
    return new Promise((resolve, reject) => {
      resolve(this._presets[method])
    })
  }
}

exports.Service = Service
