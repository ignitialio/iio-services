const fs = require('fs')
const path = require('path')

const ConnectorFactory = require('../lib/connector-factory')

let connectorFactory = new ConnectorFactory()

let basedir = path.join(__dirname, '../lib/connectors')
let connectorSrcs = fs.readdirSync(basedir)

for (let cs of connectorSrcs) {
  let Klass = require(path.join(basedir, cs))
  connectorFactory.registerConnectorClass(cs.replace('.connector.js', ''), Klass)
}

console.log(connectorFactory.list())

let onSubscription = info => {
  console.log('mamamia subscription got event', info)

  redisConnector.on('key', (key, operation) => {
    console.log('key [' + key + '] ' + operation)
  })

  redisConnector.set('iios:iios:mamamia', 'toto').then(value1 => {
    redisConnector.get('iios:iios:mamamia').then(value2 => {
      console.log(value1, value2, value1 === value2)

      redisConnector.unsubscribe('mamamia', onSubscription).then(info => {
        console.log('unsubcribed', info)
        redisConnector.destroy().then(() => {
          console.log('disconnected')
        }).catch(err => { console.log(err) })
      }).catch(err => { console.log(err) })
    }).catch(err => { console.log(err) })
  }).catch(err => { console.log(err) })
}

// default options
let redisConnector = connectorFactory.getConnectorInstance('redis')
redisConnector.initialize().then(() => {
  redisConnector.subscribe('mamamia', onSubscription).then(info => {
    console.log('subcribed', info)

    redisConnector.publish('mamamia', 'titi').then(() => {
      console.log('published mamamia titi')
    }).catch(err => { console.log(err) })
  }).catch(err => { console.log(err) })
}).catch(err => console.log(err))
