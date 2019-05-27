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
      db: 0,
      ipFamily: 4
    }

    this.encoder = this._options.encoder || JSONEncoder

    this._listeners = {
      onConnect: this._onConnect.bind(this),
      onPubConnect: this._onPubConnect.bind(this),
      onSubConnect: this._onSubConnect.bind(this),
      onMessage: this._onMessage.bind(this),
      onPatternMessage: this._onPatternMessage.bind(this),
      onError: this._onError.bind(this),
      onEnd: this._onEnd.bind(this),
      onPubEnd: this._onPubEnd.bind(this),
      onSubEnd: this._onSubEnd.bind(this)
    }

    // channel subscriptions
    this._subscriptions = {}
    // pattern subscriptions
    this._psubscriptions = {}

    if (this._options.sentinels) {
      this._redis = new Redis({
        sentinels: this._options.sentinels,
        name: this._options.master || 'mymaster',
        family: this._options.ipFamily,
        db: this._options.db
      })

      this._redisPublisher = new Redis({
        sentinels: this._options.sentinels,
        name: this._options.master || 'mymaster',
        family: this._options.ipFamily,
        db: this._options.db
      })

      this._redisSubscriber = new Redis({
        sentinels: this._options.sentinels,
        name: this._options.master || 'mymaster',
        family: this._options.ipFamily,
        db: this._options.db
      })
    } else {
      this._redis = new Redis({
        port: this._options.port,
        host: this._options.host,
        family: this._options.ipFamily,
        db: this._options.db
      })

      this._redisPublisher = new Redis({
        port: this._options.port,
        host: this._options.host,
        family: this._options.ipFamily,
        db: this._options.db
      })

      this._redisSubscriber = new Redis({
        port: this._options.port,
        host: this._options.host,
        family: this._options.ipFamily,
        db: this._options.db
      })
    }

    this._redis.on('ready', this._listeners.onConnect)
    this._redis.on('error', this._listeners.onError)
    this._redis.on('end', this._listeners.onEnd)
    this._redisPublisher.on('ready', this._listeners.onPubConnect)
    this._redisPublisher.on('error', this._listeners.onError)
    this._redisPublisher.on('end', this._listeners.onPubEnd)
    this._redisSubscriber.on('connect', this._listeners.onSubConnect)
    this._redisSubscriber.on('error', this._listeners.onError)
    this._redisSubscriber.on('message', this._listeners.onMessage)
    this._redisSubscriber.on('pmessage', this._listeners.onPatternMessage)
    this._redisSubscriber.on('end', this._listeners.onSubEnd)
  }

  subscribeKVEvents(pattern = ':*', db) {
    return new Promise((resolve, reject) => {
      // allow event subscription on keys (discovery)
      this._redisSubscriber.config('set', 'notify-keyspace-events', 'KEA').then(() => {
        // subscribe to keyspace for key update detection
        this._redisSubscriber
          .psubscribe('__keyspace@' + db || this._options.db +
            '__:' + pattern)
          .then(() => {
            resolve(pattern, db)
          }).catch(err => reject(err))
      }).catch(err => reject(err))
    })
  }

  _onConnect() {
    this.emit('connect', 'dico')
  }

  _onPubConnect() {
    this.emit('connect', 'publisher')
  }

  _onSubConnect() {
    this.emit('connect', 'subscriber')
  }

  _onEnd() {
    this.emit('end', 'dico')
  }

  _onPubEnd() {
    this.emit('end', 'publisher')
  }

  _onSubEnd() {
    this.emit('end', 'subscriber')
  }

  _onMessage(channel, message) {
    try {
      message = this.encoder.unpack(message)
    } catch (err) {
      console.log('received message with bad format', channel)
    }

    if (message) {
      if (this._subscriptions[channel]) {
        for (let cb of this._subscriptions[channel]) {
          cb(message)
        }
      }

      this.emit('message', channel, message)
    }
  }

  _onPatternMessage(pattern, channel, message) {
    if (message) {
      if (channel.match('__keyspace')) {
        let key = channel.replace('__keyspace@' + this._options.db + '__:', '')
        // update type === message === <set || del || ...>
        this.emit('key', key, message)
      } else {
        try {
          message = this.encoder.unpack(message)
        } catch (err) {
          console.log('received message with bad format', pattern, channel)
        }

        if (this._psubscriptions[pattern]) {
          for (let cb of this._psubscriptions[pattern]) {
            cb(message)
          }
        }

        this.emit('pmessage', pattern, channel, message)
        this.emit('message', channel, message)
      }
    }
  }

  _onError(err) {
    this.emit('error', err)
  }

  subscribe(channel, cb) {
    return new Promise((resolve, reject) => {
      this._subscriptions[channel] = this._subscriptions[channel] || []
      this._redisSubscriber.subscribe(channel).then(count => {
        this._subscriptions[channel].push(cb)
        resolve({
          channels: count,
          currentChannelSubscriptions: this._subscriptions[channel].length
        })
      }).catch(err => reject(err))
    })
  }

  psubscribe(pattern, cb) {
    return new Promise((resolve, reject) => {
      this._psubscriptions[pattern] = this._psubscriptions[pattern] || []
      this._redisSubscriber.psubscribe(pattern).then(count => {
        this._psubscriptions[pattern].push(cb)
        resolve({
          patterns: count,
          currentPatternSubscriptions: this._psubscriptions[pattern].length
        })
      }).catch(err => reject(err))
    })
  }

  unsubscribe(channel, cb) {
    return new Promise((resolve, reject) => {
      if (this._subscriptions[channel]) {
        if (this._subscriptions[channel].length > 0) {
          for (let i = 0; i < this._subscriptions[channel].length; i++) {
            if (this._subscriptions[channel][i] === cb) {
              this._subscriptions[channel].splice(i, 1)
              let channelLength = this._subscriptions[channel].length
              if (channelLength === 0) {
                this._redisSubscriber.unsubscribe(channel).then(count => {
                  resolve({
                    channels: count,
                    currentChannelSubscriptions: 0
                  })
                }).catch(err => reject(err))
                return
              }
            }
          }

          resolve({
            channels: Object.keys(this._subscriptions[channel]).length,
            currentChannelSubscriptions: 0
          })
        } else {
          this._redisSubscriber.unsubscribe(channel).then(count => {
            resolve({
              channels: count,
              currentChannelSubscriptions: 0
            })
          }).catch(err => reject(err))
        }
      } else {
        reject(new Error('no channel named [' + channel + ']'))
      }
    })
  }

  punsubscribe(pattern, cb) {
    return new Promise((resolve, reject) => {
      if (this._psubscriptions[pattern]) {
        if (this._psubscriptions[pattern].length > 0) {
          for (let i = 0; i < this._psubscriptions[pattern].length; i++) {
            if (this._psubscriptions[pattern][i] === cb) {
              this._psubscriptions[pattern].splice(i, 1)
              let patternLength = this._psubscriptions[pattern].length
              if (patternLength === 0) {
                this._redisSubscriber.punsubscribe(pattern).then(count => {
                  resolve({
                    patterns: count,
                    currentPatternSubscriptions: 0
                  })
                }).catch(err => reject(err))
                return
              }
            }
          }

          resolve({
            patterns: Object.keys(this._psubscriptions[pattern]).length + 1,
            currentPatternSubscriptions: 0
          })
        } else {
          this._redisSubscriber.punsubscribe(pattern).then(count => {
            resolve({
              patterns: count,
              currentPatternSubscriptions: 0
            })
          }).catch(err => reject(err))
        }
      } else {
        reject(new Error('no pattern named [' + pattern + ']'))
      }
    })
  }

  publish(channel, message) {
    return new Promise((resolve, reject) => {
      if (channel) {
        this._redisPublisher.publish(channel, this.encoder.pack(message))
        resolve()
      } else {
        reject(new Error('channel missing'))
      }
    })
  }

  keys(pattern = '*') {
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

  mget(keys) {
    return new Promise((resolve, reject) => {
      if (!keys) {
        reject(new Error('onf of the keys [' + keys + '] is missing'))
      } else {
        this._redis.mget(keys).then(values => {
          resolve(values)
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
        this._redis.off('ready', this._listeners.onConnect)
        this._redis.off('error', this._listeners.onError)
        this._redisPublisher.off('ready', this._listeners.onPubConnect)
        this._redisPublisher.off('error', this._listeners.onError)
        this._redisSubscriber.off('connect', this._listeners.onSubConnect)
        this._redisSubscriber.off('error', this._listeners.onError)
        this._redisSubscriber.off('message', this._listeners.onMessage)
        this._redisSubscriber.off('pmessage', this._listeners.onPatternMessage)

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
