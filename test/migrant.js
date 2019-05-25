const Service = require('../lib/service').Service
const config = require('./config')

class Migrant extends Service {
  constructor(options) {
    options.name = 'migrant'
    super(options)

    process.on('SIGINT', () => {
      console.log('SIGINT')
      this._destroy()
      process.exit()
    })

    this._registerMethods()
  }

  sayYes(args) {
    return new Promise((resolve, reject) => {
      resolve('Yes Mister ' + args.toWhom)
    })
  }
}

let migrant = new Migrant(config)
migrant._init().then(() => {
  console.log('Migrant is ready')
}).catch(err => {
  console.log(err)
})
