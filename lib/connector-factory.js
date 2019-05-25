class ConnectorFactory {
  constructor() {
    this._connectorClasses = {}
  }

  registerConnectorClass(name, Klass) {
    this._connectorClasses[name] = Klass
  }

  getConnectorInstance(name, options) {
    return new this._connectorClasses[name](options)
  }

  list() {
    return Object.keys(this._connectorClasses)
  }
}

module.exports = ConnectorFactory
