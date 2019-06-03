const Writable = require('stream').Writable

const debug = require('debug')('iios:output-stream')

class OutputStream extends Writable {
  constructor(connector, options) {
    super(options)

    if (connector) {
      this._connector = connector // reference: DO NOT destroy
    } else {
      throw new Error('connector missing')
    }

    this._namespace = options.namespace || 'iios'
    this._name = options.name || 'ostream_' + Math.random().toString(36).slice(2)
    this._channel = 'iios:' + this._namespace + '__stream:' + this._name

    debug('Output stream %s initialized', this._name)
  }

  get name() {
    return this._name
  }

  _write(chunk, encoding, done) {
    this._connector.rawPublish(this._channel, chunk).then(() => {
      done(null)
    }).catch(err => {
      done(err)
    })
  }

  _final(done) {
    this._connector.rawPublish(this._channel, Buffer.from([0x00])).then(() => {
      done(null)
    }).catch(err => {
      done(err)
    })
  }
}

module.exports = OutputStream
