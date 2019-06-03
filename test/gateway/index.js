const chalk = require('chalk')
const should = require('should')
const fs = require('fs')
const path = require('path')

const Gateway = require('../../').Gateway
const config = require('./config')

let gateway = new Gateway(config)
gateway._init().then(() => {
  console.log(chalk.green('gateway initialized ✔'))

  if (process.env.STREAMING) {
    let fstream = gateway._addStream('ifs', 'ofs')
    let ofs = fs.createWriteStream('./test-copy.log')
    fstream.pipe(ofs)

    fstream.on('error', err => {
      console.log(chalk.red('copy file ✘'))
    })

    fstream.on('end',  () => {
      console.log(chalk.green('stream piping end ✔'))

      let f1 = fs.readFileSync(path.join(__dirname, '../service/bob.service.js'), 'utf8')
      let f2 = fs.readFileSync('./test-copy.log', 'utf8')

      try {
        (f1 === f2).should.be.true()
        console.log(chalk.green('copy file ✔'))
      } catch (err) {
        console.log(chalk.red('copy file ✘'))
        console.log(err)
      }
    })

    let jstream = gateway._addStream('ijs', 'ojs', { encoder: 'json' })

    jstream.on('error', err => {
      console.log(chalk.red('data stream ✘'))
      console.log('error event', err)
    })

    jstream.on('end', () => {
      console.log(chalk.green('data stream piping end ✔'))
    })

    jstream.on('data', data => {
      try {
        data = JSON.parse(data)
        console.log(chalk.green('message format ✔'))
      } catch (err) {
        console.log(chalk.red('message format ✘'))
      }

      try {
        (data.toto === 1 && data.titi === 2).should.be.true()
        console.log(chalk.green('data stream ✔'))
      } catch (err) {
        console.log(chalk.red('data stream ✘'))
        console.log(err)
      }
    })
  }
}).catch(err => {
  console.log(chalk.red('gateway initialized ✘'))
  console.log(err)
})

if (!process.env.STREAMING) {
  if (config.pubsubRPC) {
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

        service.saveYes('alice', { $userId: '200' }).then(response => {
          console.log(chalk.red('get saveYes access not granted response ✘'))
        }).catch(err => {
          console.log(chalk.green('get saveYes access not granted response ✔'))

          try {
            (!!err.toString().match('access not granted')).should.be.true()
            console.log(chalk.green('bob\'s saveYes response ✔'))
          } catch (err) {
            console.log(chalk.red('bob\'s saveYes response ✘'))
            console.log(err)
          }
        })

        service.saveYes('alice', { $userId: 'gcrood' }).then(response => {
          console.log(chalk.green('get saveYes with gcrood response ✔'))

          try {
            (response === 'Yes is saved dear alice or gcrood').should.be.true()
            console.log(chalk.green('bob\'s saveYes with gcrood response ✔'))
          } catch (err) {
            console.log(chalk.red('bob\'s saveYes with gcrood response ✘'))
            console.log(response)
          }
        }).catch(err => {
          console.log(chalk.red('get saveYes with gcrood response ✘'))
          console.log('err', err)
        })

        service.saveYes('alice', { $userId: 'gcrood' }).then(response => {
          console.log(chalk.green('get saveYes with gcrood response 2 ✔'))

          try {
            (response === 'Yes is saved dear alice or gcrood').should.be.true()
            console.log(chalk.green('bob\'s saveYes with gcrood response 2 ✔'))
          } catch (err) {
            console.log(chalk.red('bob\'s saveYes with gcrood response 2 ✘'))
            console.log(response)
          }
        }).catch(err => {
          console.log(chalk.red('get saveYes with gcrood response 2 ✘'))
          console.log('err', err)
        })

        service.putYes({
          toWhome: 'alice'
        }, { $userId: 'gcrood' }).then(response => {
          console.log(chalk.green('get putYes response ✔'))

          try {
            (response === 'Yes is in the hole dear alice or gcrood').should.be.true()
            console.log(chalk.green('bob\'s putYes response ✔'))
          } catch (err) {
            console.log(chalk.red('bob\'s putYes response ✘'))
            console.log(response)
          }
        }).catch(err => {
          console.log(chalk.red('get putYes response ✘'))
          console.log('err', err)
        })

        service.sayYes({
          toWhome: 'alice'
        }, { $userId: 'gcrood' }).then( async response => {
          console.log(chalk.green('get bob response ✔'))

          try {
            (response === 'Yes dear alice or gcrood').should.be.true()
            console.log(chalk.green('bob\'s sayYes response ✔'))
          } catch (err) {
            console.log(chalk.red('bob\'s sayYes response ✘'))
            console.log(response)
          }

          service.tellUndefined({
            toWhome: 'alice'
          }, { $userId: 'gcrood' }).then(response => {
            console.log(chalk.green('get bob undefined response ✔'))

            try {
              (response === undefined).should.be.true()
              console.log(chalk.green('bob\'s tellUndefined response ✔'))
            } catch (err) {
              console.log(chalk.red('bob\'s tellUndefined response ✘'))
              console.log(response)
            }
          }).catch(err => {
            console.log(chalk.red('get bob undefined response ✘'))
            console.log('err', err)
          })

          try {
            console.log('++++ START STRESS TEST ++++')
            let t0 = Date.now()
            let cycles = 80000
            for (let i = 0; i < cycles; i++) {
              await service.saveYes('alice', { $userId: 'gcrood' })
            }
            let t1 = Date.now()
            console.log('STRESS TEST: ' + (t1 - t0))
            console.log('STRESS TEST AVG: ' + (t1 - t0) / cycles)

            console.log('----METRICS----\n', gateway.metrics, '\n----  END   ---')
          } catch (err) {
            console.log(chalk.red('stress test ✘'))
          }
          console.log('++++  END STRESS TEST  ++++')
        }).catch(err => {
          console.log(chalk.red('get bob response ✘'))
          console.log('err', err)
        })
      }).catch(err => {
        console.log(chalk.red('got bob service API ✘'))
        console.log(err)
      })
    }).catch(err => {
      console.log(chalk.red('found bob service ✘'))
    })
  }

  gateway.on('service:registered', (serviceName, serviceInfo) => {
    if (serviceName === 'ted') {
      console.log(chalk.green('ted service registered ✔'))

      gateway.api.ted.saveYes('alice', { $userId: 'gcrood' }).then(response => {
        console.log(chalk.green('get ted\'s saveYes response ✔'))

        try {
          (response === 'Yes is saved dear alice or gcrood').should.be.true()
          console.log(chalk.green('ted\'s saveYes response ✔'))
        } catch (err) {
          console.log(chalk.red('ted\'s saveYes response ✘'))
          console.log(response)
        }
      }).catch(err => {
        console.log(chalk.green('get ted\'s saveYes response ✔'))
        console.log('err', err)
      })

      gateway.api.ted.putYes({
        toWhome: 'alice'
      }, { $userId: 'gcrood' }).then(response => {
        console.log(chalk.green('get ted\'s putYes response ✔'))

        try {
          (response === 'Yes is in the hole dear alice or gcrood').should.be.true()
          console.log(chalk.green('ted\'s putYes response ✔'))
        } catch (err) {
          console.log(chalk.red('ted\'s putYes response ✘'))
          console.log(response)
        }
      }).catch(err => {
        console.log(chalk.green('get ted\'s putYes response ✘'))
        console.log('err', err)
      })

      gateway.api.ted.sayYes({
        toWhome: 'alice'
      }, { $userId: 'tcrood' }).then(response => {
        console.log(chalk.green('get ted response ✔'))

        try {
          (response === 'Yes dear alice or tcrood').should.be.true()
          console.log(chalk.green('ted\'s sayYes response ✔'))
        } catch (err) {
          console.log(chalk.red('ted\'s sayYes response ✘'))
          console.log(response)
        }

        gateway.api.ted.tellNothing({ $userId: 'tcrood' }).then(async response => {
          console.log(chalk.green('get ted undefined response ✔'))

          try {
            (response === undefined).should.be.true()
            console.log(chalk.green('ted\'s tellUndefined response ✔'))
          } catch (err) {
            console.log(chalk.red('ted\'s tellUndefined response ✘'))
            console.log(response)
          }

          try {
            console.log('++++ START STRESS TEST ++++')
            let t0 = Date.now()
            let cycles = 8000
            for (let i = 0; i < cycles; i++) {
              await gateway.api.ted.saveYes('alice', { $userId: 'gcrood' })
            }
            let t1 = Date.now()
            console.log('STRESS TEST: ' + (t1 - t0))
            console.log('STRESS TEST AVG: ' + (t1 - t0) / cycles)

            console.log('----METRICS----\n', gateway.metrics, '\n----  END   ---')
          } catch (err) {
            console.log(chalk.red('stress test ✘'))
            console.log(err)
          }

          console.log('++++  END STRESS TEST  ++++')
        }).catch(err => {
          console.log(chalk.green('get ted undefined response ✘'))
          console.log('err', err)
        })
      }).catch(err => {
        console.log(chalk.green('get ted response ✘'))
        console.log('err', err)
      })
    }
  })
}
