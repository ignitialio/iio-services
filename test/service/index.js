const chalk = require('chalk')
const config = require('./config')
const Bob = require('./bob.service')

let bob = new Bob(config)
bob._init().then(() => {
  console.log(chalk.green(process.env.SERVICE_NAME + ' service initialized ✔'))
}).catch(err => console.log(chalk.red(process.env.SERVICE_NAME + ' service initialized ✘')))
