'use strict'

const Service = require('./service').Service

/*
 - Allows unified call through single entry point
*/
class Gateway extends Service {
  constructor(options) {
    options.name = options.name || '__gateway'
    super(options)

    // registered services API
    this._api = {}

    // response timeout: default to 5s
    this._options.timeout = this._options.timeout || 5000

    // new service to be added to the dico on remote instance up declaration
    this.on('service:up', (serviceName, serviceInfo) => {
      this._addService(serviceName, serviceInfo)
    })

    // service to be deleted on remote instance delete
    this.on('service:down', serviceName => {
      delete this._api[serviceName]
      // service unregistered
      this.emit('service:unregistered', serviceName)
    })
  }

  _init(asService) {
    return new Promise((resolve, reject) => {
      this._getAvailableNSServices().then(services => {
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

  get api() {
    return this._api
  }

  get services() {
    return this._services
  }

  /* get KV keys related to namespace or not */
  kvKeys(args, userId) {
    return new Promise((resolve, reject) => {
      args = args || {}
      let pattern = args.pattern || this._namespace + ':*'
      this._connector.keys(pattern).then(keys => {
        if (keys) {
          resolve({ keys: keys })
        } else {
          reject(new Error('failed to get keys for pattern [' + pattern + ']'))
        }
      }).catch(err => reject(err))
    })
  }

  /* get KV keys related to namespace or not */
  kvGet(args, userId) {
    return new Promise((resolve, reject) => {
      if (!args || !args.key) {
        reject(new Error('key is missing'))
        return
      }

      this._connector.get(args.key).then(value => {
        if (value) {
          resolve({ value: value })
        } else {
          reject(new Error('failed to get data for key [' +
            args.key + ']'))
        }
      }).catch(err => reject(err))
    })
  }

  /* delete KV key */
  kvDel(args, userId) {
    return new Promise((resolve, reject) => {
      if (args && args.name) {
        this._connector.del(args.name).then(() => {
          resolve()
        }).catch(err => reject(err))
      } else {
        reject(new Error('must provide key name'))
      }
    })
  }

  /* add new service to the gateway */
  _addService(serviceName, serviceInfo) {
    if (!serviceName || !serviceInfo) {
      console.log('weird service', serviceName)
      return
    }

    this._api[serviceName] = {}

    for (let m of serviceInfo.methods) {
      this._addMethod(serviceInfo.name, m)
    }

    // new service available and registered event
    this.emit('service:registered', serviceName, serviceInfo)
  }

  /* add service method processing */
  _addMethod(serviceName, methodName) {
    let remoteCall = (args, userId) => {
      args = args || {} /* always an object, never undefined */

      return new Promise((resolve, reject) => {
        // req has to be stringified JSON ==> methods args object
        let token = Math.random().toString(36).slice(2)
        let channel = this._namespace + ':' + serviceName + ':' + methodName
        // true if request answered by peer
        let done = false

        let onmessage = (channel, msg) => {
          done = true

          if (msg.meta && !msg.meta.req && msg.meta.token === token) {
            this._connector.unsubscribe(channel, onmessage)
            if (msg.err) {
              reject(new Error(msg.err))
            } else {
              resolve(msg.response)
            }
          }
        }

        this._connector.subscribe(channel, onmessage).then(() => {
          setTimeout(() => {
            if (done) return
            this._connector.unsubscribe(channel, onmessage)
            reject(new Error('timeout: ' + serviceName + ':' + methodName + ' call'))
          }, this._options.timeout)

          // send message to remote service
          this._connector.publish(channel, {
            meta: {
              origin: this.uuid,
              userId: args.$userId || userId, /* user id injection */
              token: token
            },
            req: args
          }).catch(err => reject(err))
        }).catch(err => reject(err))
      })
    }

    // create endpoint
    if (methodName.match(/:/)) {
      // namespaced services/sub-services
      let nsMethodName = methodName.split(':')
      let ns = nsMethodName[0]
      let m = nsMethodName[1]
      this._api[serviceName][ns] = this._api[serviceName][ns] || {}
      this._api[serviceName][ns][m] = remoteCall
    } else {
      // no namespace
      this._api[serviceName][methodName] = remoteCall
    }
  }

  /* wait for remote service to be available (= in the dico) */
  _waitForService(name, timeout) {
    return new Promise((resolve, reject) => {
      var checkTimeout

      var checkInterval = setInterval(() => {
        if (this._api[name]) {
          clearInterval(checkInterval)

          if (checkTimeout) {
            clearTimeout(checkTimeout)
          }

          resolve(this._api[name])
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
