'use strict'

const connectorFactory = require('connector-factory')

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

const utils = require('./utils')

/*
- Implements service concept in order to publish itself to distributed dico

options {
  name: string,
  type: 'native' || 'adapted',  // ==> if uses non JS implementation
  info: object,
  methods: array,
  auth: true || false || <object>
}
*/
class Service extends EventEmitter {
  constructor(options) {
    super()

    this.uuid = Math.random().toString(36).slice(2)

    this._options = options || {}
    this._options.connector = this._options.connector || '{ redis: null }'
    this._namespace = 'iios:'  + (this._options.namespace || 'ds')
    this._packageJson = JSON.parse(await fs.readFileSync('package.json', 'utf8'))

    this._listeners = {
      onIIOSEvent: this._onIIOSEvent.bind(this),
      onMessage: this._onMessage.bind(this)
    }

    let connectorType = Object.keys(this._options.connector)[0]

    this._connector =
      (new ConnectorFactory()).getConnectorInstance(connectorType, this._options.connector)
    this._connector.subscribeKVEvents(this._namespace + ':*')
    this._connector.subscribe(this._namespace + '__event', this._listeners.onIIOSEvent)
    this._connector.on('message', this._listerners.onMessage)

    this._name = this._options.name || this.uuid

    // catch signals for clean shutdown
    // => must catch signal to clean up connector/discovery
    this._killingListener = this._killingMeSoftly.bind(this)
    process.on('SIGINT', this._killingListener)
    process.on('SIGTERM', this._killingListener)

    // methods that can be called remotely for this service
    this._methods = null

    // http callable lethods
    this._httpMethods = {
      get: [],
      post: [],
      put: [],
      del: []
    }

    // current subscribed methods indexed on corresponding channel
    this._subscribedMethods = {}

    // service says that is starting
    this._emitHeartBeat({ message: 'service starting' }, 'starting')

    // manage heartbeat
    if (this._options.heartbeatPeriod) {
      setInterval(() => {
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

  get name() {
    return this._name
  }

  _serveHTTP() {
    return new Promise((resolve, reject) => {
      // declare HTTP server serving static files
      let path2serve = path.join(process.cwd(), this._options.server.path)

      this._httpApp = connect()
        .use( bodyParser.urlencoded( { extended: true } ) )
        .use( bodyParser.json() )
        .use( serveStatic(path2serve, { 'index': [ 'index.html' ] }) )

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
        if (err) { console.log(err) }
        console.log('> Discovery host ' + this._options.server.host)
        console.log('> HTTP server ready at ' +
          JSON.stringify(this._httpServer.address()) + ':' +
          this._options.server.port + ' for ' + path2serve)

        // call _init only when everything defined by the child class
        // emit signal to proceed to registration
        resolve()
      })
    })
  }

  _killingMeSoftly() {
    console.log('diying on SIGTERM or SIGINT')
    this._emitHeartBeat({ message: 'SIGTERM/SIGINT received' }, 'stopping')
    this._destroy()
    setTimeout(() => {
      console.log('died on SIGTERM or SIGINT')
      process.exit()
    }, 500)
  }

  _init() {
    return new Promise(async (resolve, reject) => {
      let httpConnectionInfo = {}

      // get version from service package.json (not lib's one)
      let versionPath = path.join(process.cwd(), 'package.json')
      if (fs.existsSync(versionPath)) {
        let version = JSON.parse(fs.readFileSync(versionPath, 'utf8')).version
        meta.version = version
      }
      httpConnectionInfo.port = this._options.server.port
      meta.host = this._options.server.host

      this._options.publicOptions = this._options.publicOptions || {}
      this._options.publicOptions.metadata = meta

      this._registerMethods().then(methods => {
        // register HTTP API
        for (let m of methods) {
          let lookup = this[m].toString().match(/\@_(.*?)_/)
          if (!!lookup) {
            let httpAPICallType = lookup[1].toLowerCase()

            if (typeof this._rest[httpAPICallType] === 'function') {
              let cb = async (request, content) => {
                try {
                  let result = await this[m](request.body)
                  return result
                } catch(err) {
                  return err
                }
              }

              this._rest[httpAPICallType]('/' + m, cb)
            }
          }
        }

        resolve()
      }).catch(err => {
        // BUG: why error is not passed ? String is...
        reject(err)
      })
    })
  }

  /* processes IIOS event (push event) */
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

  /* emits service push event */
  _emitPushEvent(name, data) {
    let message = {
      meta: {
        origin: this.uuid,
        event: name,
        service: this._name
      },
      data: data
    }

    this._connector.publish(this._namespace + '__event', message)
  }

  _onMessage(channel, message) {
    if (!message.meta || this.uuid === message.meta.origin) return

    if (message.meta.req) {
      if (this._subscribedMethods[channel] && typeof
        this._subscribedMethods[channel](message) === 'function') {
        this._subscribedMethods[channel](message)
      }
    }
  }

  _getAvailableNSServices(namespace) {
    return new Promise((resolve, reject) => {
      let pattern  = namespace ? namespace + ':*' : this._namespace + ':*'
      let services = {}

      this._connector.keys(pattern).then(keys => {
        if (keys && keys.length > 0) {
          this._connector.mget(pattern).then(values => {
            for (let i = 0; i < values.length; i++) {
              let serviceShortName = keys[i].replace(this._namespace + ':', '')
              services[shortName] = this._connector.encoder.unpack(values[i])
            }

            resolve(services)
          }).catch(err => reject(err))
        } else {
          resolve(services)
        }
      }).catch(err => reject(err))
    })
  }

  _registerOneMethod(method) {
    return new Promise((resolve, reject) => {
      // register HTTP API call type (REST like)
      let lookup = this[method].toString().match(/\@_(.*?)_/)

      if (!!lookup) {
        let httpAPICallType = lookup[1].toLowerCase()
        if (this._httpMethods[httpAPICallType] &&
          Array.isArray(this._httpMethods[httpAPICallType])) {
          if (this._httpMethods[httpAPICallType].indexOf(method) === -1) {
            this._httpMethods[httpAPICallType].push(method)
          }
        }
      }

      // subscribe to method related channel
      let channel = this._namespace + ':' + this._name + ':' + method

      // request callback
      let reqCallback = requestMsg => {
        // call service method
        this[method](requestMsg.meta.req, requestMsg.meta.userId).then(response => {
          let responseMessage = {
            meta: {
              origin: this.uuid,
              token: requestMsg.meta.token
            },
            response: res
          }

          this._connector.publish(channel, responseMessage)
        }).catch(err => {
          let errMessage = {
            meta: {
              origin: this.uuid,
              token: requestMsg.token
            },
            err: '' + err
          }

          this._connector.publish(channel, errMessage)
        })
      }

      this._connector.subscribe(channel, reqCallback).then(() => {
        resolve()
      }).catch(err => reject(err))
    })
  }

  /* register public methods available from remote */
  _registerMethods() {
    return new Promise(async (resolve, reject) => {
      // reject if multiple register calls
      if (this._methods) {
        reject(new Error('methods registration already done'))
      }

      // automatically detects methods
      this._methods = utils.getMethods(this)

      for (let m of this._methods) {
        await this._registerOneMethod(m)
      }

      // add service to local and remote dico
      let serviceInfo = {
        name: this._name,
        lang: 'js',
        creationTimestamp: Date.now(),
        methods: this._methods,
        httpMethods: this._httpMethods,
        options: this._options.publicOptions
      }

      this._connector.set(this._namespace + ':' + this._name, pack(serviceInfo))
        .then(() => {
          resolve(this._methods)
        }).catch(err => reject(err))
    })
  }

  /* emits hearbeat */
  _emitHeartBeat(data, status = 'alive') {
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

    this._connector.publish('iios:' + this._namespace + '__heartbeat', message)
  }

  /* subscribes to heartbeat event */
  _subscribeHeartBeat(namespace = '*') {
    return new Promise((resolve, reject) => {
      this._connector.psubscribe('iios:' + namespace + ':__heartbeat', (pattern, message) => {
          if (message.meta && message.meta.origin !== this.uuid) {
            this.emit('heartbeat', message)
          }
        })
        .then(subscriptionsInfo => {
          resolve(subscriptionsInfo)
        }).catch(err => reject(err))
    })
  }

  /* unsubscribes to hearbeat push event */
  _unsubscribeHeartBeat(namespace = '*') {
    return new Promise((resolve, reject) => {
      this._connector.punsubscribe('iios:' + namespace + ':__heartbeat')
        .then(subscriptionsInfo => {
          resolve(subscriptionsInfo)
        }).catch(err => reject(err))
    })
  }

  /* to be called on destroy */
  async _destroy() {
    try {
      try {
        process.off('SIGINT', this._killingListener)
        process.off('SIGTERM', this._killingListener)
      } catch (err) {
        console.log('something weird with process.off', process.off)
      }

      this._emitHeartBeat({ message: 'service stopping' }, 'stopping')
      this._connector.del(this._namespace +':' + this._name)
      await this._connector.unsubscribe(this._namespace +'__event')
      this._connector.subscribe(this._namespace + '__event', this._listeners.onIIOSEvent)
      this._connector.off('message', this._listerners.onMessage)
      await this._connector.destroy()
    } catch(err) {
      console.log(err)
      process.exit(1)
    }
  }

  /* to be called on destroy if message to display */
  async _dying(msg, err) {
    await this._destroy()

    // delay to let connector remove server data from redis
    setTimeout(() => {
      console.log(msg, err)
      process.exit(1)
    }, 500)
  }

  /* -------------------------------------------------------------------------
     Public default methods
     -------------------------------------------------------------------------*/

  /* provides app base info */
  info() {
    return new Promise((resolve, reject) => {
      resolve(this._packageJson)
    })
  }
}

exports.Service = Service
