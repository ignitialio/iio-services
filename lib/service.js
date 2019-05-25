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

const Redis = require('ioredis')

const util = require('./util')

const pack = JSON.stringify
const unpack = JSON.parse

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

    this._options = options
    this._options.redis = this._options.redis || {}

    this.uuid = Math.random().toString(36).slice(2)
    this._namespace = 'iios:'  + (this._options.namespace || 'ds')
    this._name = this._options.name || this.uuid
    this._redisDB = this._options.redis.db || 0

    // catch signals for clean shutdown
    // => must catch signal to clean up Redis dico
    this._killingListener = this._killingMeSoftly.bind(this)
    process.on('SIGINT', this._killingListener)
    process.on('SIGTERM', this._killingListener)

    // methods that can be called remotely for this service
    this._methods = null

    // HTTP API
    this._httpAPI = {}

    // current subscription channels
    this._subscriptions = []

    // current subscribed methods indexed on corresponding channel
    this._subscribedMethods = {}

    // current events subscriptions
    this._subscribedEvents = {}

    if (this._options.redis.sentinels) {
      this._redis = new Redis({
        sentinels: this._options.redis.sentinels,
        name: this._options.redis.master || 'mymaster',
        family: this._options.redis.ipFamily || 4,
        db: this._redisDB
      })

      this._redisPublisher = new Redis({
        sentinels: this._options.redis.sentinels,
        name: this._options.redis.master || 'mymaster',
        family: this._options.redis.ipFamily || 4,
        db: this._redisDB
      })

      this._redisSubscriber = new Redis({
        sentinels: this._options.redis.sentinels,
        name: this._options.redis.master || 'mymaster',
        family: this._options.redis.ipFamily || 4,
        db: this._redisDB
      })
    } else {
      this._redis = new Redis({
        port: this._options.redis.port || 6379,
        host: this._options.redis.host || '127.0.0.1',
        family: this._options.redis.ipFamily || 4,
        db: this._redisDB
      })

      this._redisPublisher = new Redis({
        port: this._options.redis.port || 6379,
        host: this._options.redis.host || '127.0.0.1',
        family: this._options.redis.ipFamily || 4,
        db: this._redisDB
      })

      this._redisSubscriber = new Redis({
        port: this._options.redis.port || 6379,
        host: this._options.redis.host || '127.0.0.1',
        family: this._options.redis.ipFamily || 4,
        db: this._redisDB
      })
    }

    this._redisSubscriber.config('set', 'notify-keyspace-events','KEA').then(() => {
      this._redisSubscriber
        .psubscribe('__keyspace@' + this._redisDB + '__:' + this._namespace + ':*')
        .then(() => {
          this._redisSubscriber.subscribe(this._namespace + '__event')
            .then(() => {
              if (this._options.server) {
                // declare HTTP server serving static files
                let path2serve = path.join(process.cwd(), this._options.server.path)

                this._app = connect()
                  .use( bodyParser.urlencoded( { extended: true } ) )
                  .use( bodyParser.json() )
                  .use( serveStatic(path2serve, { 'index': [ 'index.html' ] }) )

                // REST API manager
                this._rest = Rest.create({
                  context: this._options.rest.context,
                  apiKeys: this._options.rest.apiKeys,
                  logger: { level: 'error' }
                })

                // adds connect-rest middleware to connect
                this._app.use(this._rest.processRequest())

                this._server = new http.Server(this._app)

                // start web server
                this._server.listen(this._options.server.port, '0.0.0.0', err => {
                  if (err) { console.log(err) }
                  console.log('> Discovery host ' + this._options.server.host)
                  console.log('> Superstatically ready at '
                  + JSON.stringify(this._server.address()) + ':' + this._options.server.port
                  + ' for ' + path2serve)

                  // call _init only when everything defined by the child class
                  // emit signal to proceed to registration
                  this._ready = true
                })
              } else {
                // call _init only when everything defined by the child class
                // emit signal to proceed to registration
                this._ready = true
              }
            }).catch(err => {
              console.log(err)
              process.exit(1)
            })
        }).catch(err => {
          console.log(err)
          process.exit(1)
        })
      }).catch(err => {
        console.log(err)
        process.exit(1)
      })

    this._redisSubscriber.on('message', this._processMessage.bind(this))
    this._redisSubscriber.on('pmessage', this._processPMessage.bind(this))
    // DO NOT REGISTER METHODS HERE: register methods in child class

    // service says that is starting
    this._emitHeartBeat({ message: 'SIGTERM or SIGINT received' }, 'starting')

    // manage heartbeat
    if (this._options.heartbeatPeriod) {
      setInterval(() => {
        cpuStats(this._options.heartbeatPeriod, (error, result) => {
          this._info().then(info => {
            let hbData = {
              cpus: result,
              hostname: os.hostname(),
              err: error,
              ...info
            }
            this._emitHeartBeat(hbData)
          }).catch(err => pino.error(err, 'failed to get app info'))
        })
      }, this._options.heartbeatPeriod)
    }
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
    return new Promise((resolve, reject) => {
      let meta = {}

      // get version from service package.json (not lib's one)
      let versionPath = path.join(process.cwd(), 'package.json')
      if (fs.existsSync(versionPath)) {
        let version = JSON.parse(fs.readFileSync(versionPath, 'utf8')).version
        meta.version = version
      }
      meta.port = this._options.server.port
      meta.host = this._options.server.host
      meta.rest = this._options.rest

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

  _waitForPropertySet(name, value, delay) {
    return new Promise((resolve, reject) => {
      var checkTimeout

      var checkInterval = setInterval(() => {
        if (this[name] === value) {
          clearInterval(checkInterval)
          clearTimeout(checkTimeout) // nothing if undefined

          resolve(this[name])
        }
      }, 100)

      checkTimeout = setTimeout(() => {
        if (checkInterval) {
          clearInterval(checkInterval)
          reject(new Error('timeout: property ' + name +
          ' has not been set to requested value '))
        }
      }, delay || 5000)
    })
  }

  get name() {
    return this._name
  }

  _getAvailableNSServices() {
    return new Promise((resolve, reject) => {
      let services = {}
      this._redis.keys(this._namespace + ':*').then(keys => {
        if (keys && keys.length > 0) {
          this._redis.mget(keys).then(servicesList => {
            for (let i = 0; i < servicesList.length; i++) {
              let shortName = keys[i].replace(this._namespace + ':', '')
              services[shortName] = unpack(servicesList[i])
            }

            resolve(services)
          }).catch(err => reject(err))
        } else {
          resolve(services)
        }
      }).catch(err => reject(err))
    })
  }

  _processMessage(channel, message) {
    message  = unpack(message)
    if (message) {
      if (this.uuid === message.origin) return
      if (channel.match('__event')) {
        if (this._subscribedEvents[message.name]) {
          for (let cb of this._subscribedEvents[message.name]) {
            cb(message)
          }
        }

        // any event subscriptions
        if (this._subscribedEvents['*']) {
          for (let cb of this._subscribedEvents['*']) {
            cb(message)
          }
        }
      } else if (channel.match('__heartbeat')) {
        this.emit('heartbeat', message)
      } else if (message.req) {
        if (this._subscribedMethods[channel] && typeof
          this._subscribedMethods[channel](message) === 'function') {
          this._subscribedMethods[channel](message)
        }
      }

      this.emit('message', channel, message)
    }
  }

  async _processPMessage(pattern, channel, message) {
    if (message) {
      if (channel.match('__event')) {
        message  = unpack(message)
        if (this.uuid === message.origin) return
        if (this._subscribedEvents[message.name]) {
          for (let cb of this._subscribedEvents[message.name]) {
            cb(message.data, message.service)
          }
        }
      } else if (message.req) {
        message  = unpack(message)
        if (this.uuid === message.origin) return
        if (this._subscribedMethods[channel] && typeof
          this._subscribedMethods[channel](message) === 'function') {
          this._subscribedMethods[channel](message)
        }
      } else if (channel.match('__heartbeat')) {
        this.emit('heartbeat', message)
      } else {
        let serviceFullName = channel.replace('__keyspace@' + this._redisDB + '__:', '')
        let serviceShortName = serviceFullName.replace(this._namespace + ':', '')
        let service = unpack(await this._redis.get(serviceFullName))

        service = service || serviceShortName

        if (message === 'set') {
          this.emit('service:up', service)
        } else {
          this.emit('service:down', service)
        }
      }

      this.emit('pmessage', pattern, channel, message)
    }
  }

  async _registerOneMethod(method) {
    return new Promise((resolve, reject) => {
      // register HTTP API call type (REST like)
      let lookup = this[method].toString().match(/\@_(.*?)_/)

      if (!!lookup) {
        let httpAPICallType = lookup[1]
        this._httpAPI[httpAPICallType] = this._httpAPI[httpAPICallType] || []
        this._httpAPI[httpAPICallType].push(method)

        // mark as READ or WRITE
        if (httpAPICallType.match(/GET/)) {
          this._readMethods = this._readMethods || []
          this._readMethods.push(method)
        } else if (httpAPICallType.match(/POST/) || 
        httpAPICallType.match(/DEL/) || httpAPICallType.match(/PUT/)) {
          this._writeMethods = this._writeMethods || []
          this._writeMethods.push(method)
        }
      }

      // subscribe to method related channel
      let channel = this._namespace + ':' + this._name + ':' + method
      this._redisSubscriber.subscribe(channel).then(() => {
        this._subscriptions.push(channel)

        this._subscribedMethods[channel] = reqMsg => {
          // call service method
          this[method](reqMsg.req, reqMsg.userId).then(res => {
            let resMessage = {
              origin: this.uuid,
              res: res,
              token: reqMsg.token
            }

            this._redisPublisher.publish(channel, pack(resMessage))
          }).catch(err => {
            let resMessage = {
              origin: this.uuid,
              serviceErr: '' + err,
              token: reqMsg.token
            }

            this._redisPublisher.publish(channel, pack(resMessage))
          })
        }

        resolve()
      }).catch(err => reject(err))
    })
  }

  /* register public methods available from remote */
  _registerMethods() {
    return new Promise(async (resolve, reject) => {
      // clear existing subscriptions if any (due to multiple register calls)
      if (this._subscriptions.length > 0) {
        this._redisSubscriber.unsubscribe.apply(this._redisSubscriber, this._subscriptions)
      }

      // automatically detects methods
      this._methods = util.getMethods(this)

      for (let m of this._methods) {
        await this._registerOneMethod(m)
      }

      // add service to local and remote dico
      let serviceInfo = {
        name: this._name,
        type: 'native',
        creationTimestamp: Date.now(),
        methods: this._methods,
        read: this._readMethods,
        write: this._writeMethods,
        httpAPI: this._httpAPI,
        options: this._options.publicOptions
      }

      this._redis.set(this._namespace + ':' + this._name, pack(serviceInfo))
        .then(() => {
          resolve(this._methods)
        }).catch(err => reject(err))
    })
  }

  /* emits hearbeat */
  _emitHeartBeat(data, status = 'alive') {
    let message = {
      origin: this.uuid,
      data: data,
      service: this._name,
      namespace: this._namespace,
      timestamp: Date.now(),
      status: status
    }

    this._redisPublisher.publish('iios:iios:__heartbeat', pack(message))
  }

  /* subscribes to heartbeat push event */
  _subscribeHeartBeat() {
    this._redisSubscriber.subscribe('iios:iios:__heartbeat')
  }

  /* unsubscribes to hearbeat push event */
  _unsubscribeHeartBeat() {
    this._redisSubscriber.unsubscribe('iios:iios:__heartbeat')
  }

  /* emits service push event */
  _emitPushEvent(name, data) {
    let message = {
      origin: this.uuid,
      name: name,
      data: data,
      service: this._name
    }

    this._redisPublisher.publish(this._namespace + '__event', pack(message))
  }

  /* subscribes to service push event */
  _subscribePushEvent(name, cb) {
    this._subscribedEvents[name] = this._subscribedEvents[name] || []
    this._subscribedEvents[name].push(cb)
  }

  /* unsubscribes to service push event */
  _unsubscribePushEvent(name, cb) {
    this._redisSubscriber.unsubscribe(this._namespace + '__event')
    if (this._subscribedEvents[name]) {
      delete this._subscribedEvents[name]
    }
  }

  /* provide app info */
  _info() {
    return new Promise((resolve, reject) => {
      if (!this._appInfo) {
        fs.readFile('package.json', 'utf8', (err, result) => {
          if (err) {
            reject(err)
          } else {
            this._appInfo = {
              name: JSON.parse(result).name,
              version: JSON.parse(result).version
            }
            resolve(this._appInfo)
          }
        })
      } else {
        resolve(this._appInfo)
      }
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

      this._redis.del(this._namespace +':' + this._name)
      await this._redisSubscriber.unsubscribe(this._namespace +'__event')
      await this._redisSubscriber
        .unsubscribe('__keyspace@' + this._redisDB + '__:' + this._namespace + ':*')

      await this._redisSubscriber.unsubscribe
        .apply(this._redisSubscriber, this._subscriptions)

      this._redisSubscriber.disconnect()
      this._redisPublisher.disconnect()
      this._redis.disconnect()
    } catch(err) {
      console.log(err)
      process.exit(1)
    }
  }

  /* to be called on destroy if message to display */
  _dying(msg, err) {
    this._destroy()
    setTimeout(() => {
      console.log(msg, err)
      process.exit(1)
    }, 500)
  }
}

exports.Service = Service
