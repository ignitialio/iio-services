const fs = require('fs')
const path = require('path')
const debug = require('debug')('iios:connector-factory')

class ConnectorFactory {
  constructor() {
    this._connectorClasses = {}

    let connectorSrcs = fs.readdirSync(__dirname)

    try {
      for (let cs of connectorSrcs) {
        if (cs.match(/\.connector\.js/)) {
          let Klass = require(path.join(__dirname, cs))
          this.registerConnectorClass(cs.replace('.connector.js', ''), Klass)
        }
      }
    } catch (err) {
      debug('failed to register connectors with error %o. exiting...', err)
      console.log(err)
      process.exit(1)
    }
  }

  registerConnectorClass(name, Klass) {
    this._connectorClasses[name] = Klass
    debug('registered class %o with name %s', Klass, name)
    debug('now connectors are %o', this._connectorClasses)
  }

  getConnectorInstance(name, options) {
    debug('instantiating class %o named %s with options %o',
      this._connectorClasses[name], name, options)
    if (this._connectorClasses[name]) {
      let instance = new this._connectorClasses[name](options)
      return instance
    } else {
      throw new Error('connector [' + name + '] missing')
    }
  }

  list() {
    return Object.keys(this._connectorClasses)
  }
}

exports.ConnectorFactory = ConnectorFactory
