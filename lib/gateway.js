'use strict'

const util = require('./util')
const Service = require('./service').Service

const pack = JSON.stringify
const unpack = JSON.parse

/*
 - Allows unified call through single entry point
*/
class Gateway extends Service {
  constructor(options) {
    options.name = options.name || '__gateway'
    super(options)

    // registered services
    this._services = {}

    // registered services info
    this._servicesInfo = {}

    // new service to be added to the dico on remote instance up declaration
    this.on('service:up', service => {
      this._addService(service)
    })

    // service to be deleted on remote instance delete
    this.on('service:down', service => {
      delete this._services[service]
      // service unregistered
      this.emit('service:unregistered', service)
    })
  }

  _init(asService) {
    return new Promise((resolve, reject) => {
      let services = this._getAvailableNSServices().then(services => {
        if (services) {
          for (let service in services) {
            this._addService(services[service])
          }
        }

        if (asService) {
          super._init().then(() => {
            resolve()
          }).catch(err => reject(err))
        } else {
          resolve()
        }
      }).catch(err => reject(err))
    })
  }

  get services() {
    return this._services
  }

  get servicesInfo() {
    return this._servicesInfo
  }

  /* get Redis keys related to namespace or not*/
  redisKeys(args, userId) {
    return new Promise((resolve, reject) => {
      args = args || {}
      this._redis.keys(args.pattern || this._namespace + ':*').then(result => {
        if (result) {
          resolve({ keys: result })
        } else {
          reject(new Error('failed to get keys for pattern [' +
            args.pattern || this._namespace + ':*' + ']'))
        }
      }).catch(err => reject(err))
    })
  }

  /* get Redis keys related to namespace or not*/
  redisGet(args, userId) {
    return new Promise((resolve, reject) => {
      if (!args || !args.key) {
        reject(new Error('key is missing'))
        return
      }

      this._redis.get(args.key).then(result => {
        if (result) {
          resolve({ result: result })
        } else {
          reject(new Error('failed to get data for key [' +
            args.key + ']'))
        }
      }).catch(err => reject(err))
    })
  }

  /* delete Redis key */
  redisDelKey(args, userId) {
    return new Promise((resolve, reject) => {
      if (args && args.name) {
        this._redis.del(args.name).then(() => {
          resolve()
        }).catch(err => reject(err))
      } else {
        reject(new Error('must provide key name'))
      }
    })
  }

  /* add new service to the gateway */
  _addService(service) {
    if (!service || !service.name) {
      console.log('weird service', service)
      return
    }

    this._servicesInfo[service.name] = service
    this._services[service.name] = {}

    for (let m of service.methods) {
      this._addMethod(service.name, m)
    }

    // new service available and registered event
    this.emit('service:registered', service)
  }

  /* add service method processing */
  _addMethod(serviceName, methodName) {
    let remoteCall = (args, userId) => {
      args = args || {} // always an object, never undefined

      return new Promise((resolve, reject) => {
        // req has to be stringified JSON ==> methods args object
        let req = JSON.stringify(args)
        let token = Math.random().toString(36).slice(2)
        let channel = this._namespace + ':' + serviceName + ':' + methodName

        this._redisSubscriber.subscribe(channel).then(() => {
          let done
          let onmessage = (channel, msg) => {
            done = true
            let info = channel.split(':')
            let service = info[3]
            let method = info[4]

            if (!msg.req && msg.token === token) {
              this.removeListener('message', onmessage)
              if (msg.serviceErr) {
                reject(new Error(msg.serviceErr))
              } else {
                resolve(msg.res)
              }
            }
          }

          // TBD: deal with single subscription for ottoman like case
          this.on('message', onmessage)

          setTimeout(() => {
            if (done) return
            this.removeListener('message', onmessage)
            this._redisSubscriber.unsubscribe(channel)
            reject(new Error('timeout: ' + serviceName + ':' + methodName + ' call'))
          }, this._options.timeout || 5000)

          // send message to remote service
          this._redisPublisher.publish(channel, pack({
            origin: this.uuid,
            req: args || {},
            token: token,
            userId: args.$userId || userId
          })).catch(err => reject(err))
        }).catch(err => reject(err))
      })
    }

    // create endpoint
    if (methodName.match(/\:/)) {
      // namespaced services/sub-services
      let nsMethodName = methodName.split(':')
      let ns = nsMethodName[0]
      let m = nsMethodName[1]
      this._services[serviceName][ns] = this._services[serviceName][ns] || {}
      this._services[serviceName][ns][m] = remoteCall
    } else {
      // no namespace
      this._services[serviceName][methodName] = remoteCall
    }
  }

  /* wait for remote service to be available (= in the dico) */
  _waitForService(name, timeout) {
    return new Promise((resolve, reject) => {
      var checkTimeout

      var checkInterval = setInterval(() => {
        if (this._services[name]) {
          clearInterval(checkInterval)

          if (checkTimeout) {
            clearTimeout(checkTimeout)
          }

          resolve(this._services[name])
        }
      }, 100)

      checkTimeout = setTimeout(() => {
        if (checkInterval) {
          clearInterval(checkInterval)

          reject(new Error('timeout: service ' + name + ' is not available'))
        }
      }, timeout || 5000)
    })
  }
}

exports.Gateway = Gateway
