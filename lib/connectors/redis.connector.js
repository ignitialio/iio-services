const Redis = require('ioredis')
const EventEmitter = require('events').EventEmitter
const JSONEncoder = require('../encoders/json.encoder')

class RedisConnector extends EventEmitter {
  constructor(options) {
    super()

    this.uuid = Math.random().toString(36).slice(2)
    this._options = options || {
      host: '127.0.0.1',
      port: 6379,
      iiodb: 0,
      ipFamily: 4
    }

    this._namespace = this._options.namespace || 'iios'

    this._encoder = this._options.encoder || JSONEncoder
    this._ready = false

    this._listeners = {
      processMessage: this._processMessage.bind(this),
      processPMessage: this._processPMessage.bind(this)
    }

    this._subscriptions = {}

    if (this._options.sentinels) {
      this._redis = new Redis({
        sentinels: this._options.sentinels,
        name: this._options.master || 'mymaster',
        family: this._options.ipFamily,
        db: this._options.iiodb
      })

      this._redisPublisher = new Redis({
        sentinels: this._options.sentinels,
        name: this._options.master || 'mymaster',
        family: this._options.ipFamily,
        db: this._options.iiodb
      })

      this._redisSubscriber = new Redis({
        sentinels: this._options.sentinels,
        name: this._options.master || 'mymaster',
        family: this._options.ipFamily,
        db: this._options.iiodb
      })
    } else {
      this._redis = new Redis({
        port: this._options.port,
        host: this._options.host,
        family: this._options.ipFamily,
        db: this._options.iiodb
      })

      this._redisPublisher = new Redis({
        port: this._options.port,
        host: this._options.host,
        family: this._options.ipFamily,
        db: this._options.iiodb
      })

      this._redisSubscriber = new Redis({
        port: this._options.port,
        host: this._options.host,
        family: this._options.ipFamily,
        db: this._options.iiodb
      })
    }
  }

  initialize() {
    return new Promise((resolve, reject) => {
      // allow event subscription on keys (discovery)
      this._redisSubscriber.config('set', 'notify-keyspace-events', 'KEA').then(() => {
        // subscribe to keyspace for key update detection
        console.log('key subscription', '__keyspace@' + this._options.iiodb +
          '__:' + this._namespace + ':*')
        this._redisSubscriber
          .psubscribe('__keyspace@' + this._options.iiodb +
            '__:' + this._namespace + ':*')
          .then(() => {
            this._redisSubscriber
              .subscribe(this._namespace + '__event').then(() => {
                // call _init only when everything defined by the child class
                // emit signal to proceed to registration
                this._ready = true

                this._redisSubscriber.on('message', this._listeners.processMessage)
                this._redisSubscriber.on('pmessage', this._listeners.processPMessage)
                resolve()
              }).catch(err => reject(err))
          }).catch(err => reject(err))
      }).catch(err => reject(err))
    })
  }

  _processMessage(channel, message) {
    try {
      message = this._encoder.unpack(message)
    } catch (err) {
      console.log('received message with bad format', channel)
    }

    if (message) {
      if (channel.match('__event')) {
        this.emit('event', message)
      } else if (channel.match('__heartbeat')) {
        this.emit('heartbeat', message)
      } else {
        if (this._subscriptions[channel]) {
          for (let cb of this._subscriptions[channel]) {
            console.log('for channel', message)
            cb(message)
          }
        }
      }

      this.emit('message', channel, message)
    }
  }

  async _processPMessage(pattern, channel, message) {
    if (message) {
      if (channel.match('__keyspace')) {
        let key = channel.replace('__keyspace@' + this._options.iiodb + '__:', '')
        // update type === message === <set || del || ...>
        console.log(key, message)
        this.emit('key', key, message)
      } else {
        try {
          message = this._encoder.unpack(message)
        } catch (err) {
          console.log('received message with bad format', pattern, channel)
        }

        if (this._subscriptions[channel] &&
          typeof this._subscriptions[channel](message) === 'function') {
          this._subscriptions[channel](message)
        }
        this.emit('pmessage', pattern, channel, message)
        this.emit('message', channel, message)
      }
    }
  }

  subscribe(channel, cb) {
    return new Promise(async (resolve, reject) => {
      let count = Object.keys(this._subscriptions).length

      if (!this._subscriptions[channel]) {
        let nCount = await this._redisSubscriber.subscribe(channel)

        if (nCount !== count + 3) {
          await this._redisSubscriber.unsubscribe(channel)
          reject(new Error('number of subscritpions mismatches: ' +
            nCount + ' !== ' + (count + 3)))
          return
        } else {
          this._subscriptions[channel] = []
          count = nCount
        }
      }

      this._subscriptions[channel].push(cb)

      resolve({
        channels: count,
        currentChannelLength: this._subscriptions[channel].length
      })
    })
  }

  unsubscribe(channel, cb) {
    return new Promise(async (resolve, reject) => {
      if (this._subscriptions[channel]) {
        for (let i = 0; i < this._subscriptions[channel].length; i++) {
          if (this._subscriptions[channel][i] === cb) {
            let count = Object.keys(this._subscriptions).length

            this._subscriptions[channel].splice(i, 1)
            let channelLength = this._subscriptions[channel].length
            if (channelLength === 0) {
              let nCount = await this._redisSubscriber.unsubscribe(channel)
              if (nCount !== count + 1) {
                reject(new Error('number of subscritpions mismatches: ' +
                  nCount + ' !== ' + (count + 1)))
                return
              } else {
                resolve({
                  channels: nCount,
                  currentChannelLength: 0
                })
              }
            }

            resolve({
              channels: count,
              currentChannelLength: channelLength
            })
          }
        }
      } else {
        reject(new Error('no channel named [' + channel + ']'))
      }
    })
  }

  publish(channel, message) {
    return new Promise((resolve, reject) => {
      if (channel) {
        this._redisPublisher.publish(channel, this._encoder.pack(message))
        resolve()
      } else {
        reject(new Error('channel missing'))
      }
    })
  }

  keys(pattern = 'iios:*') {
    return new Promise((resolve, reject) => {
      this._redis.keys(pattern).then(keys => {
        if (keys) {
          resolve(keys)
        } else {
          reject(new Error('failed to get keys for pattern [' + pattern + ']'))
        }
      }).catch(err => reject(err))
    })
  }

  get(key) {
    return new Promise((resolve, reject) => {
      if (!key) {
        reject(new Error('key [' + key + '] is missing'))
      } else {
        this._redis.get(key).then(value => {
          resolve(value)
        }).catch(err => reject(err))
      }
    })
  }

  set(key, value) {
    return new Promise((resolve, reject) => {
      if (key) {
        this._redis.set(key, value).then(() => {
          resolve(value)
        }).catch(err => reject(err))
      } else {
        reject(new Error('key name missing'))
      }
    })
  }

  del(key) {
    return new Promise((resolve, reject) => {
      if (key) {
        this._redis.del(key).then(() => {
          resolve()
        }).catch(err => reject(err))
      } else {
        reject(new Error('key name missing'))
      }
    })
  }

  destroy() {
    return new Promise(async (resolve, reject) => {
      try {
        await this._redisSubscriber.unsubscribe
          .apply(this._redisSubscriber, Object.keys(this._subscriptions))

        this._redisSubscriber.disconnect()
        this._redisPublisher.disconnect()
        this._redis.disconnect()

        resolve()
      } catch (err) {
        reject(err)
      }
    })
  }
}

module.exports = RedisConnector
