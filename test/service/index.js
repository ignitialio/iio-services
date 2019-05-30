const chalk = require('chalk')
const config = require('./config')
const Bob = require('./bob.service')

function sleep(sec) {
  return new Promise((resolve, reject) => {
    setTimeout(() => resolve(), parseInt(sec) * 1000)
  })
}

sleep(process.env.DELAYED).then(() => {
  let bob = new Bob(config)
  bob._init().then(() => {
    console.log(chalk.green(process.env.SERVICE_NAME + ' service initialized ✔'))
  }).catch(err => console.log(chalk.red(process.env.SERVICE_NAME + ' service initialized ✘')))
})
