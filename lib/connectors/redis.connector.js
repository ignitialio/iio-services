const Redis = require('ioredis')
const EventEmitter = require('events').EventEmitter
const Encoders = require('../encoders')

const debug = require('debug')('iios:redis-connector')

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

    debug('redis connector instance with options: %j', this._options)

    this._options.encoder = this._options.encoder || 'json'
    this.encoder = Encoders[this._options.encoder]

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

      this._redisPublisher = this._redis.duplicate()
      this._redisSubscriber = this._redis.duplicate()
    } else {
      this._redis = new Redis({
        port: this._options.port,
        host: this._options.host,
        family: this._options.ipFamily,
        db: this._options.db
      })

      this._redisPublisher = this._redis.duplicate()
      this._redisSubscriber = this._redis.duplicate()
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

  /* ------------------------------------------------------------------------
     subscribes to keyspace events (key event in the KV store)
     ------------------------------------------------------------------------ */
  subscribeKVEvents(pattern = ':*', db) {
    return new Promise((resolve, reject) => {
      // allow event subscription on keys (discovery)
      this._redisSubscriber.config('set', 'notify-keyspace-events', 'KEA').then(() => {
        // subscribe to keyspace for key update detection
        this._redisSubscriber
          .psubscribe('__keyspace@' + (db || this._options.db) +
            '__:' + pattern)
          .then(() => {
            debug('subscribed to keyspace with pattern %s on db %s: %s',
              pattern, db || this._options.db,
              '__keyspace@' + (db || this._options.db) + '__:' + pattern)
            resolve(pattern, db)
          }).catch(err => reject(err))
      }).catch(err => reject(err))
    })
  }

  /* ------------------------------------------------------------------------
     on _redis connection
     ------------------------------------------------------------------------ */
  _onConnect() {
    this.emit('connect', 'dico')
  }

  /* ------------------------------------------------------------------------
     on _redisPublisher connection
     ------------------------------------------------------------------------ */
  _onPubConnect() {
    this.emit('connect', 'publisher')
  }

  /* ------------------------------------------------------------------------
     on _redisSubscriber connection
     ------------------------------------------------------------------------ */
  _onSubConnect() {
    this.emit('connect', 'subscriber')
  }

  /* ------------------------------------------------------------------------
     on _redis end
     ------------------------------------------------------------------------ */
  _onEnd() {
    this.emit('end', 'dico')
  }

  /* ------------------------------------------------------------------------
     on _redisPublisher end
     ------------------------------------------------------------------------ */
  _onPubEnd() {
    this.emit('end', 'publisher')
  }

  /* ------------------------------------------------------------------------
     on _redisSubscriber end
     ------------------------------------------------------------------------ */
  _onSubEnd() {
    this.emit('end', 'subscriber')
  }

  /* ------------------------------------------------------------------------
     event on message obtained by channel subscription
     ------------------------------------------------------------------------ */
  _onMessage(channel, rawMessage) {
    debug('received raw message %o on channel %s', rawMessage, channel)

    if (rawMessage !== undefined) {
      let message = rawMessage

      if (!channel.match('__stream')) {
        try {
          message = this.encoder.unpack(message)
        } catch (err) {
          debug('received message with bad format on channel %s', channel)
        }
      }

      if (this._subscriptions[channel]) {
        for (let cb of this._subscriptions[channel]) {
          cb(channel, message)
        }
      }

      this.emit('message', channel, message)
    } else {
      debug('received null message on channel %s', channel)
    }
  }

  /* ------------------------------------------------------------------------
     event on message obtained by pattern subscription
     ------------------------------------------------------------------------ */
  _onPatternMessage(pattern, channel, rawMessage) {
    debug('received raw message %o on channel %s for pattern %s',
      rawMessage, channel, pattern)

    if (rawMessage !== undefined) {
      let message = rawMessage

      if (channel.match('__keyspace')) {
        let key = channel.replace('__keyspace@' + this._options.db + '__:', '')
        // update type === message === <set || del || ...>
        this.emit('key', key, message)

        debug('key %s update with message %s', key, message)
      } else {
        if (!channel.match('__stream')) {
          try {
            message = this.encoder.unpack(message)
          } catch (err) {
            debug('received message with bad format with pattern %s on channel %s',
              pattern, channel)
          }
        }

        if (this._psubscriptions[pattern]) {
          for (let cb of this._psubscriptions[pattern]) {
            cb(pattern, channel, message)
          }
        }

        this.emit('pmessage', pattern, channel, message)
        this.emit('message', channel, message)
      }
    } else {
      debug('received null message on channel %s for pattern %s',
        channel, pattern)
    }
  }

  /* ------------------------------------------------------------------------
     event on connector error
     ------------------------------------------------------------------------ */
  _onError(err) {
    this.emit('error', err)
  }

  /* ------------------------------------------------------------------------
     channel subscribtion
     ------------------------------------------------------------------------ */
  subscribe(channel, cb) {
    return new Promise((resolve, reject) => {
      this._subscriptions[channel] = this._subscriptions[channel] || []

      if (this._subscriptions[channel].indexOf(cb) === -1) {
        this._redisSubscriber.subscribe(channel).then(count => {
          this._subscriptions[channel].push(cb)

          resolve({
            channels: count,
            currentChannelSubscriptions: this._subscriptions[channel].length
          })
        }).catch(err => reject(err))
      } else {
        resolve({
          channels: null,
          currentChannelSubscriptions: this._subscriptions[channel].length
        })

        debug('method already subscribed to channel %s', channel)
      }
    })
  }

  /* ------------------------------------------------------------------------
     pattern subscribtion: behaviour mapped to primary connector type (redis)
     ------------------------------------------------------------------------ */
  psubscribe(pattern, cb) {
    return new Promise((resolve, reject) => {
      this._psubscriptions[pattern] = this._psubscriptions[pattern] || []

      if (this._psubscriptions[pattern].indexOf(cb) === -1) {
        this._redisSubscriber.psubscribe(pattern).then(count => {
          this._psubscriptions[pattern].push(cb)
          resolve({
            patterns: count,
            currentPatternSubscriptions: this._psubscriptions[pattern].length
          })
        }).catch(err => reject(err))
      } else {
         resolve({
           patterns: null,
           currentPatternSubscriptions: this._psubscriptions[pattern].length
         })
         debug('method already subscribed to pattern %s', pattern)
       }
    })
  }

  /* ------------------------------------------------------------------------
     unsubscribes from given channel
     ------------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------------
     pattern unsubscribtion: behaviour mapped to primary connector type (redis)
     ------------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------------
     check if callback already registered to subscription
     ------------------------------------------------------------------------ */
  isSubscribed(channel, fct) {
    if (this._subscriptions[channel]) {
      if (this._subscriptions[channel].indexOf(fct) !== -1) {
        return true
      }
    }

    return false
  }

  /* ------------------------------------------------------------------------
     check if callback already registered to pattern subscription
     ------------------------------------------------------------------------ */
  isPatternSubscribed(pattern, fct) {
    if (this._psubscriptions[pattern]) {
      if (this._psubscriptions[pattern].indexOf(fct) !== -1) {
        return true
      }
    }

    return false
  }

  /* ------------------------------------------------------------------------
     publish encoded message on channel
     ------------------------------------------------------------------------ */
  publish(channel, message) {
    return new Promise((resolve, reject) => {
      if (channel) {
        this._redisPublisher.publish(channel, this.encoder.pack(message)).then(() => {
          resolve()
        }).catch(err => reject(err))
      } else {
        reject(new Error('channel missing'))
      }
    })
  }

  /* ------------------------------------------------------------------------
     publish raw message on channel
     ------------------------------------------------------------------------ */
  rawPublish(channel, message) {
    return new Promise((resolve, reject) => {
      if (channel) {
        this._redisPublisher.publish(channel, message).then(() => {
          resolve()
        }).catch(err => reject(err))
      } else {
        reject(new Error('channel missing'))
      }
    })
  }

  /* ------------------------------------------------------------------------
     get available keys in the KV store for a given pattern
     ------------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------------
     get value for a given key from KV store
     ------------------------------------------------------------------------ */
  get(key) {
    return new Promise((resolve, reject) => {
      if (!key) {
        reject(new Error('key [' + key + '] is missing'))
      } else {
        this._redis.get(key).then(value => {
          resolve(this.encoder.unpack(value))
        }).catch(err => reject(err))
      }
    })
  }

  /* ------------------------------------------------------------------------
     get values for multiple keys: behaviour mapped to redis
     ------------------------------------------------------------------------ */
  mget(keys) {
    return new Promise((resolve, reject) => {
      if (!keys) {
        reject(new Error('one of the keys [' + keys + '] is missing'))
      } else {
        this._redis.mget(keys).then(values => {
          if (values) {
            values = values.map(e => this.encoder.unpack(e))
          }
          resolve(values)
        }).catch(err => reject(err))
      }
    })
  }

  /* ------------------------------------------------------------------------
     sets value for a given key in the KV store
     ------------------------------------------------------------------------ */
  set(key, value) {
    return new Promise((resolve, reject) => {
      if (key) {
        this._redis.set(key, this.encoder.pack(value)).then(() => {
          resolve(value)
        }).catch(err => reject(err))
      } else {
        reject(new Error('key name missing'))
      }
    })
  }

  /* ------------------------------------------------------------------------
     delete a key from KV store
     ------------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------------
     destroy connector
     ------------------------------------------------------------------------ */
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

        await this._redisSubscriber.punsubscribe
          .apply(this._redisSubscriber, Object.keys(this._psubscriptions))

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
