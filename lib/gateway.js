'use strict'

const got = require('got')

const Service = require('./service').Service
const utils = require('./utils')

const debug = require('debug')('iios:gateway')

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

    // metrics recording
    this.metrics = []

    if (this._options.metrics) {
      this._options.metrics.maxPoints = this._options.metrics.maxPoints || 100
    }

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

  _init() {
    return new Promise((resolve, reject) => {
      super._init().then(() => {
        for (let serviceName in this._services) {
          if (serviceName !== this._name) {
            this._addService(serviceName, this._services[serviceName])
          }
        }

        // allow HTTP registering
        let cb = async (request, content) => {
          let service = request.body

          if (!request.body || JSON.stringify(request.body) === '{}') {
            service = request.parameters
          }

          try {
            // add service to low level
            if (this._services[service.name]) {
              if (utils.compareDates(this._services[service.name].creationTimestamp,
                service.creationTimestamp) !== 1) {
                // already registered with newer date
                return { done: service.name }
              }
            }

            this._services[service.name] = service

            // add service to gateway
            this._addService(service.name, service)
            debug('registered service %s thourgh HTTP API', service.name)

            return { done: service.name }
          } catch (err) {
            return err
          }
        }

        if (this._options.server) {
          this._rest.post('/register', cb)
        }

        resolve()

        debug('gateway %s service initialized with available services %j',
          this._name, Object.keys(this._api))
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
    if (serviceName === this._name) return
    if (!serviceName || !serviceInfo) {
      debug('weird service', serviceName)
      return
    }

    this._api[serviceName] = {}

    for (let m of serviceInfo.methods) {
      this._addMethod(serviceInfo.name, m)
    }

    debug('added service %s API to gateway', serviceInfo.name)

    // new service available and registered event
    this.emit('service:registered', serviceName, serviceInfo)
  }

  /* add service method processing */
  _addMethod(serviceName, methodName) {
    // TEMP: remove this when specific service
    if (['kvGet', 'kvDel', 'kvKeys'].indexOf(methodName) !== -1) return
    //

    let remoteCall

    if (this._services[serviceName].pubsubEnabled) {
      remoteCall = (...args) => {
        let t0 = Date.now() // metrics
        // userId injection is done through { $userId: '<user id>' } object
        let userId
        // inter-service call: a service can use priviledged flag to be able to
        // overpass user access control. Indeed, user access control has a
        // meaning only when call comes from web app/front end.
        // exemple of use: authentication service that requests data service for
        // user data
        let privileged

        for (let i = 0; i < args.length; i++) {
          if (args[i] && args[i].$userId !== undefined) {
            userId = args[i].$userId
            privileged = args[i].$privileged
            args.splice(i, 1)
            break
          }
        }

        return new Promise((resolve, reject) => {
          // req has to be stringified JSON ==> methods args object
          let token = utils.uuid()
          let rqChannel = this._namespace + ':' + serviceName + ':' + methodName
          // true if request answered by peer
          let done = false

          let onmessage = (channel, msg) => {
            if (msg.meta && !msg.meta.req && msg.meta.token === token) {
              done = true

              // unsubscribe from response channel (includes token)
              this._connector.unsubscribe(channel, onmessage).catch(err => {
                debug('failed to unsubscribe temporary channel %s with error %o',
                  channel, err)
              })

              if (msg.err) {
                debug('remote error [%s] with stack [%s]', msg.err, msg.stack)
                reject(new Error(msg.err))
              } else {
                resolve(msg.response)
              }
            }

            if (this._options.metrics) {
              this.metrics.push([ serviceName, methodName, (Date.now() - t0) + 'ms' ])
              if (this.metrics.length > this._options.metrics.maxPoints) {
                this.metrics.shift()
              }
            }
          }

          let responseChannel = rqChannel + ':' + token

          this._connector.subscribe(responseChannel, onmessage).then(() => {
            setTimeout(() => {
              if (done) return
              this._connector.unsubscribe(responseChannel, onmessage)
              reject(new Error('timeout: ' + serviceName + ':' + methodName + ' call'))
            }, this._options.timeout)

            // send message to remote service
            this._connector.publish(rqChannel, {
              meta: {
                origin: this.uuid,
                userId: userId,
                privileged: privileged,
                token: token
              },
              req: args
            }).catch(err => reject(err))
          }).catch(err => reject(err))
        })
      }
    } else {
      let httpCallType

      for (let ct in this._services[serviceName].httpMethods) {
        for (let m of this._services[serviceName].httpMethods[ct]) {
          if (m === methodName) {
            httpCallType = ct
            break
          }
        }

        if (httpCallType) break
      }

      if (!httpCallType) {
        debug('HTTP call type not found for service %s method %s',
          serviceName, methodName)
        return
      }

      // used when services outside of main data center (distributed)
      remoteCall = (...args) => {
        return new Promise((resolve, reject) => {
          let t0 = Date.now() // metrics
          // userId injection is done through { $userId: '<user id>' } object
          let userId
          let privileged
          for (let i = 0; i < args.length; i++) {
            if (args[i] && args[i].$userId) {
              userId = args[i].$userId
              privileged = args[i].$privileged
              args.splice(i, 1)
              break
            }
          }

          got('/' + methodName, {
            baseUrl: (this._services[serviceName].httpServer.protocol || 'http') +
              '://' +
              this._services[serviceName].httpServer.host + ':' +
              this._services[serviceName].httpServer.port + '/api',
            method: httpCallType,
            json: true,
            body: args,
            headers: { userId: userId, privileged: privileged }
          }).then(response => {
            if (response.body && response.body.status === 'ok') {
              // undefined responseChannel
              resolve(undefined)
            } else if (response.body && response.body.err) {
              debug('remote error [%s] with stack [%s]', response.body.err,
                response.body.stack)
              reject(new Error(response.body.err))
            } else {
              resolve(response.body)
            }

            if (this._options.metrics) {
              this.metrics.push([ serviceName, methodName, (Date.now() - t0) + 'ms' ])
              if (this.metrics.length > this._options.metrics.maxPoints) {
                this.metrics.shift()
              }
            }
          }).catch(err => reject(err))
        })
      }
    }

    // create endpoint
    if (methodName.match(/:/)) {
      // namespaced services/sub-services
      let nsMethodName = methodName.split(':')
      let ns = nsMethodName[0]
      let m = nsMethodName[1]
      this._api[serviceName][ns] = this._api[serviceName][ns] || {}
      this._api[serviceName][ns][m] = remoteCall

      debug('added service %s namespace %s method %s to gateway', serviceName, ns, m)
    } else {
      // no namespace
      this._api[serviceName][methodName] = remoteCall

      debug('added service %s method %s to gateway', serviceName, methodName)
    }
  }

  /* wait for remote service to be available (= in the dico) */
  _waitForService(name, timeout = 5000) {
    return new Promise((resolve, reject) => {
      var checkTimeout

      var checkInterval = setInterval(() => {
        if (this._services[name]) {
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
      }, timeout)
    })
  }

  /* wait for remote service to be available and callable */
  _waitForServiceAPI(name, timeout = 5000) {
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
      }, timeout)
    })
  }
}

exports.Gateway = Gateway
