const Gateway = require('../lib/gateway').Gateway
const config = require('./config')

let gateway = new Gateway(config)

gateway._init().then(() => {
  gateway._waitForService('meteo').then(meteo => {
    console.log('end waiting service', meteo)
    meteo.location({
      city: 'Paris'
    }).then(response => {
      console.log('meteo response', response)
    }).catch(err => {
      console.log('err', err)
    })
  }).catch(err => {
    console.log(err)
    gateway._getAvailableNSServices().then(services => {
      console.log('services', services)
    })
  })

  gateway.on('service:registered', service => {
    console.log('service', service)
    if (service.name === 'meteo') {
      gateway.services.meteo.location({
        city: 'Paris'
      }).then(response => {
        console.log('response', response)
      }).catch(err => {
        console.log('err', err)
      })
    }
  })
})
