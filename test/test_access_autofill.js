const should = require('should')
const chalk = require('chalk')
const got = require('got')

const Bob = require('./service/bob.service')
const config = require('./service/config')

config.name = 'greta'
config.accesscontrol.grants = {
  admin: {
    'create:any': [ '*' ],
    'read:any': [ '*' ],
    'update:any': [ '*' ],
    'delete:any': [ '*' ]
  },
  user: {
    'read:any': [ '*' ],
    'update:any': [ '*' ],
    'delete:any': [ '*' ]
  },
  anonymous: {
    'read:any': [ '*' ]
  }
}

config.server = {
  host: '127.0.0.1',
  port: 29000,
  path: './dist'
}

let greta = new Bob(config)


greta._init().then(async () => {
  let msgCounter = 0

  console.log(chalk.green('service initialization ✔'))

  greta._connector.keys().then(keys => {
    var index = keys.indexOf('iios:iios:greta')
    try {
      (index).should.be.aboveOrEqual(0)
      console.log(chalk.green('get keys ✔'))

      greta._connector.get('iios:iios:greta').then(async value => {
        try {
          (value.name === 'greta').should.be.true()
          console.log(chalk.green('service registred ✔'))

          try {
            let response = (await got('/sayYes?toWhome=alicehttp', {
              baseUrl: 'http://127.0.0.1:29000/api',
              method: 'get',
              json: true,
              body: [ { toWhome: 'alicehttp' } ],
              headers: { userId: 'gcrood' }
            })).body

            console.log(chalk.green('http get service call ✔'))

            try {
              (response === 'Yes dear alicehttp or gcrood').should.be.true()
              console.log(chalk.green('http get service response ✔'))
            } catch (err) {
              console.log(chalk.red('http get service response ✘'))
              console.log('' + err)
              console.log(response)
            }
          } catch (err) {
            console.log(chalk.red('http get service call ✘'))
            console.log('' + err)
          }

          try {
            let response = (await got('/saveYes?toWhome=alicehttp', {
              baseUrl: 'http://127.0.0.1:29000/api',
              method: 'post',
              json: true,
              body: [ 'alicehttp' ],
              headers: { userId: 'gcrood' }
            })).body

            console.log(chalk.green('http post service call ✔'))

            try {
              (response === 'Yes is saved dear alicehttp or gcrood').should.be.true()
              console.log(chalk.green('http post service response ✔'))
            } catch (err) {
              console.log(chalk.red('http post service response ✘'))
              console.log('' + err)
              console.log(response)
            }
          } catch (err) {
            console.log(chalk.red('http post service call ✘'))
            console.log('' + err)
            console.log(response)
          }

          try {
            let response = (await got('/putYes?toWhome=alicehttp', {
              baseUrl: 'http://127.0.0.1:29000/api',
              body: [ { toWhome: 'alicehttp' } ],
              method: 'put',
              json: true,
              headers: { userId: 'gcrood' }
            })).body

            console.log(chalk.green('http put service call ✔'))

            try {
              (response === 'Yes is in the hole dear alicehttp or gcrood').should.be.true()
              console.log(chalk.green('http put service response ✔'))
            } catch (err) {
              console.log(chalk.red('http put service response ✘'))
              console.log('' + err)
              console.log(response)
            }
          } catch (err) {
            console.log(chalk.red('http put service call ✘'))
            console.log('' + err)
            console.log(response)
          }

          try {
            let response = (await got('/killYes?toWhome=alicehttp', {
              baseUrl: 'http://127.0.0.1:29000/api',
              method: 'DELETE',
              json: true,
              headers: { userId: 'gcrood' }
            })).body

            console.log(chalk.green('http delete service call ✔'))

            try {
              (response.answer === 'Yes is killed dear alicehttp' &&
                response.userId === 'gcrood').should.be.true()
              console.log(chalk.green('http delete service response ✔'))
            } catch (err) {
              console.log(chalk.red('http delete service response ✘'))
              console.log('' + err)
              console.log(response)
            }
          } catch (err) {
            console.log(chalk.red('http delete service call ✘'))
            console.log('' + err)
            console.log(response)
          }

          try {
            let response = (await got('/tellNothing', {
              baseUrl: 'http://127.0.0.1:29000/api',
              method: 'get',
              json: true,
              headers: { userId: 'gcrood' }
            })).body

            console.log(chalk.green('http tellNothing service call ✔'))

            try {
              (response.status === 'ok').should.be.true()
              console.log(chalk.green('http tellNothing service response ✔'))
            } catch (err) {
              console.log(chalk.red('http tellNothing service response ✘'))
              console.log('' + err)
              console.log(response)
            }
          } catch (err) {
            console.log(chalk.red('http tellNothing service call ✘'))
            console.log('' + err)
            console.log(response)
          }

          setTimeout(() => {
            greta._destroy().then(() => {
              console.log(chalk.green('service destroy ✔'))
            }).catch(err => {
              console.log(chalk.red('service destroy ✘'))
              console.log('' + err)
            })
          }, 4500)
        } catch (err) {
          console.log(chalk.red('service registred ✘'))
          console.log('' + err)
        }
      }).catch(err => console.log(chalk.red('service registred ✘')))
    } catch (err) {
      console.log(chalk.red('get keys ✘'))
      console.log('' + err)
    }
  }).catch(err => console.log(chalk.red('get keys ✘')))
}).catch(err => console.log(chalk.red('connectors registering ✘')))
