const Gateway = require('../lib/gateway').Gateway
const config = require('./config')

config.server.port = 23213
let gateway = new Gateway(config)

gateway._waitForService('migrant').then(migrant => {
  console.log('waiting service', migrant)
  migrant.sayYes({
    toWhom: 'American'
  }).then(response => {
    console.log('migrant response', response)
  }).catch(err => {
    console.log('err', err)
  })
}).catch(err => {
  console.log(err)
})

gateway.on('service:registered', service => {
  console.log('service', service)
  if (service.name === 'migrant') {
    gateway.services.migrant.sayYes({
      toWhom: 'American'
    }).then(response => {
      console.log('response', response)
    }).catch(err => {
      console.log('err', err)
    })
  }
})
