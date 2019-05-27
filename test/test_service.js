const should = require('should')
const chalk = require('chalk')

const Service = require('../').Service

class Bob extends Service {
  constructor(options) {
    super(options)
  }

  sayYes(args) {
    return new Promise((resolve, reject) => {
      resolve('Yes Mister ' + args.toWhom)
    })
  }
}

let bob = new Bob({ name: 'bob'})

bob._init().then(() => {
  console.log(chalk.green('service initialization ✔'))
  bob._connector.keys().then(keys => {
    var index = keys.indexOf('iios:iios:bob')
    try {
      (index).should.be.aboveOrEqual(0)
      console.log(chalk.green('get keys ✔'))

      bob._connector.get('iios:iios:bob').then(value => {
        try {
          (bob._connector.encoder.unpack(value).name === 'bob').should.be.true()
          console.log(chalk.green('service registred ✔'))

          setTimeout(() => {
            bob._destroy().then(() => {
              console.log(chalk.green('service destroy ✔'))
            }).catch(err => {
              console.log(chalk.red('service destroy ✘'))
              console.log(err)
            })
          }, 1000)
        } catch (err) {
          console.log(chalk.red('service registred ✘'))
          console.log(err)
        }
      }).catch(err => console.log(chalk.red('service registred ✘')))
    } catch (err) {
      console.log(chalk.red('get keys ✘'))
      console.log(err)
    }
  }).catch(err => console.log(chalk.red('get keys ✘')))
}).catch(err => console.log(chalk.red('connectors registering ✘')))
