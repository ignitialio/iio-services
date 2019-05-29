const should = require('should')
const chalk = require('chalk')
const got = require('got')

const Bob = require('./service/bob.service')

let bob = new Bob({
  name: 'bob',
  heartbeatPeriod: 1000,
  server: {
    host: '127.0.0.1',
    port: 29000,
    path: './dist'
  }
})

let heartbeatCounter = 0

bob.on('heartbeat', message => {
  heartbeatCounter++
})

bob._init().then(async () => {
  let msgCounter = 0
  let hbInterval = setInterval(() => {
    bob._connector.publish('iios:iios__heartbeat', {
        meta: {
          origin: Math.random().toString(36).slice(2),
          service: 'test',
          namespace: 'iios',
          timestamp: Date.now(),
          status: 'alive'
        },
        data: {}
      }).then(() => {
        msgCounter++
        console.log(chalk.green('publish message ' + msgCounter + ' on channel ' +
          'iios:iios__heartbeat ✔'))
      }).catch(err => {
        console.log(chalk.red('publish message ' + msgCounter + ' on channel ' +
          'iios:iios__heartbeat ✘'))
      })
  }, 1000)

  console.log(chalk.green('service initialization ✔'))
  try {
    await bob._subscribeHeartBeat('iios')
    console.log(chalk.green('heartbeat subscription ✔'))
  } catch (err) {
    console.log(chalk.red('heartbeat subscription ✘'))
  }

  bob._connector.keys().then(keys => {
    var index = keys.indexOf('iios:iios:bob')
    try {
      (index).should.be.aboveOrEqual(0)
      console.log(chalk.green('get keys ✔'))

      bob._connector.get('iios:iios:bob').then(async value => {
        try {
          (bob._connector.encoder.unpack(value).name === 'bob').should.be.true()
          console.log(chalk.green('service registred ✔'))

          try {
            let response = (await got('/sayYes?toWhome=alicehttp', {
              baseUrl: 'http://127.0.0.1:29000/api',
              method: 'get',
              json: true,
              body: { toWhome: 'alicehttp' },
              headers: { userId: '200' }
            })).body

            console.log(chalk.green('http get service call ✔'))

            try {
              (response === 'Yes dear alicehttp or 200').should.be.true()
              console.log(chalk.green('http get service response ✔'))
            } catch (err) {
              console.log(chalk.red('http get service response ✘'))
              console.log(response)
            }
          } catch (err) {
            console.log(chalk.red('http get service call ✘'))
          }

          try {
            let response = (await got('/saveYes?toWhome=alicehttp', {
              baseUrl: 'http://127.0.0.1:29000/api',
              method: 'post',
              json: true,
              body: { toWhome: 'alicehttp' },
              headers: { userId: '200' }
            })).body

            console.log(chalk.green('http post service call ✔'))

            try {
              (response === 'Yes is saved dear alicehttp or 200').should.be.true()
              console.log(chalk.green('http post service response ✔'))
            } catch (err) {
              console.log(chalk.red('http post service response ✘'))
              console.log(response)
            }
          } catch (err) {
            console.log(chalk.red('http post service call ✘'))
          }

          try {
            let response = (await got('/putYes?toWhome=alicehttp', {
              baseUrl: 'http://127.0.0.1:29000/api',
              body: { toWhome: 'alicehttp' },
              method: 'put',
              json: true,
              headers: { userId: '200' }
            })).body

            console.log(chalk.green('http put service call ✔'))

            try {
              (response === 'Yes is in the hole dear alicehttp or 200').should.be.true()
              console.log(chalk.green('http put service response ✔'))
            } catch (err) {
              console.log(chalk.red('http put service response ✘'))
              console.log(response)
            }
          } catch (err) {
            console.log(chalk.red('http put service call ✘'))
          }

          try {
            let response = (await got('/killYes?toWhome=alicehttp', {
              baseUrl: 'http://127.0.0.1:29000/api',
              method: 'DELETE',
              json: true,
              headers: { userId: '200' }
            })).body

            console.log(chalk.green('http delete service call ✔'))

            try {
              (response.answer === 'Yes is killed dear alicehttp' &&
                response.userId === '200').should.be.true()
              console.log(chalk.green('http delete service response ✔'))
            } catch (err) {
              console.log(chalk.red('http delete service response ✘'))
              console.log(response)
            }
          } catch (err) {
            console.log(chalk.red('http delete service call ✘'))
          }

          setTimeout(() => {
            bob._destroy().then(() => {
              console.log(chalk.green('service destroy ✔'))
              try {
                (heartbeatCounter === 4).should.be.true()
                console.log(chalk.green('heartbeat message ✔'))
              } catch (err) {
                console.log(chalk.red('heartbeat message ✘'))
                console.log(heartbeatCounter)
              }
              clearInterval(hbInterval)
            }).catch(err => {
              console.log(chalk.red('service destroy ✘'))
              console.log(err)
            })
          }, 4500)
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
