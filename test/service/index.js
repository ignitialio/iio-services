const chalk = require('chalk')

const Service = require('../../').Service
const config = require('./config')

class Bob extends Service {
  constructor(options) {
    super(options)
  }

  sayYes(args) {
    return new Promise((resolve, reject) => {
      resolve('Yes dear ' + args.toWhom)
    })
  }
}

let bob = new Bob(config)
bob._init().then(() => {
  console.log(chalk.green(process.env.SERVICE_NAME + ' service initialized ✔'))
}).catch(err => console.log(chalk.red(process.env.SERVICE_NAME + ' service initialized ✘')))
