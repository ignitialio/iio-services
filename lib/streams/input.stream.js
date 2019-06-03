const Readable = require('stream').Readable

const debug = require('debug')('iios:input-stream')

class InputStream extends Readable {
  constructor(connector, destination, options) {
    super(options)

    if (connector) {
      this._connector = connector // reference: DO NOT destroy
    } else {
      throw new Error('connector missing')
    }

    if (destination) {
      this._destination = destination
    } else {
      throw new Error('destination missing')
    }

    this._namespace = options.namespace || 'iios'
    this._name = options.name || 'istream_' + Math.random().toString(36).slice(2)
    this._channel = 'iios:' + this._namespace + '__stream:' + this._destination

    this._listeners = {
      onMessage: this._onMessage.bind(this)
    }
  }

  get name() {
    return this._name
  }

  _onMessage(channel, message) {
    debug('received message on channel %s with length %d', channel, message.length)

    if (message.toString() === '\u0000') {
      this.emit('end')
      debug('received NULL chunk')
      return
    }

    try {
      if (!this.push(message)) {
        this._connector.unsubscribe(this._channel, this._listeners.onMessage)
          .then(() => {
            debug('unsubscribe since push returned null')
          }).catch(() => {
            debug('fail to unsubscribe when push returned null')
          })
      }
    } catch (err) {
      debug('error occured pushing data: %o', err)
    }
  }

  _read(size) {
    if (!this._connector.isSubscribed(this._channel, this._listeners.onMessage)) {
      this._connector.subscribe(this._channel, this._listeners.onMessage).then(async () => {
        debug('input stream %s initialized on read call', this._name)
      }).catch(err => {
        debug('subscription failed on read call with error %o', err)
        this.emit('error', err)
      })
    } else {
      debug('already subscribed to channel %s', this._channel)
    }
  }

  async _destroy() {
    debug('destroying...')
    try {
      await this._connector.unsubscribe(this._channel, this._listeners.onMessage)
    } catch (err) {
      throw err
    }
  }
}

module.exports = InputStream
