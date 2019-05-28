const chalk = require('chalk')
const should = require('should')

const Gateway = require('../../').Gateway
const config = require('./config')

let gateway = new Gateway(config)
gateway._init().then(() => {
  console.log(chalk.green('gateway initialized ✔'))
}).catch(err => {
  console.log(chalk.red('gateway initialized ✘'))
  console.log(err)
})

gateway._waitForService('bob').then(serviceInfo => {
  try {
    (serviceInfo.name === 'bob').should.be.true()
    console.log(chalk.green('found bob service ✔'))
  } catch (err) {
    console.log(chalk.red('found bob service ✘'))
    console.log(err)
  }

  gateway._waitForServiceAPI('bob').then(service => {
    (service !==  undefined).should.be.true()
    console.log(chalk.green('got bob service API ✔'))

    service.sayYes({
      toWhom: 'alice'
    }).then(response => {
      console.log(chalk.green('get bob response ✔'))
      console.log('bob\'s response', response)

      service.tellUndefined({
        toWhom: 'alice'
      }).then(response => {
        console.log(chalk.green('get bob undefined response ✔'))
        console.log('bob\'s response', response)
      }).catch(err => {
        console.log(chalk.green('get bob undefined response ✘'))
        console.log('err', err)
      })
    }).catch(err => {
      console.log(chalk.green('get bob response ✘'))
      console.log('err', err)
    })
  }).catch(err => {
    console.log(chalk.green('got bob service API ✘'))
    console.log(err)
  })
}).catch(err => {
  console.log(chalk.red('found bob service ✘'))
})

gateway.on('service:registered', (serviceName, serviceInfo) => {
  if (serviceName === 'ted') {
    console.log(chalk.green('ted service registered ✔'))
    gateway.api.ted.sayYes({
      toWhom: 'alice'
    }).then(response => {
      console.log(chalk.green('get ted response ✔'))
      console.log('ted\'s response', response)
    }).catch(err => {
      console.log(chalk.green('get ted response ✘'))
      console.log('err', err)
    })
  }
})
