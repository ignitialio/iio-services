const chalk = require('chalk')
const should = require('should')
const fs = require('fs')
const path = require('path')

const Gateway = require('../../').Gateway
const config = require('./config')

var okNominalCounter = 0

let gateway = new Gateway(config)
gateway.transform = val => {
  return new Promise((resolve, reject) => {
    resolve(13 * val)
  })
}

gateway.transform2 = val => {
  return new Promise((resolve, reject) => {
    resolve(2 * val)

    try {
      (val === 42).should.be.true()
      console.log(chalk.green('calling transform from generate binding ✔'))
    } catch (err) {
      console.log(chalk.red('calling transform from generate binding ✘'))
      console.log('---------------VAL', val)
    }
  })
}

gateway._init().then(() => {
  console.log(chalk.green('gateway initialized ✔'))
  okNominalCounter++

  if (process.env.STREAMING) {
    let fstream = gateway._addStream('ifs', 'ofs')
    let ofs = fs.createWriteStream(path.join('test/logs/', './test-copy.log'))
    fstream.pipe(ofs)

    fstream.on('error', err => {
      console.log(chalk.red('copy file ✘'))
    })

    fstream.on('end',  () => {
      console.log(chalk.green('stream piping end ✔'))

      let f1 = fs.readFileSync(path.join(__dirname, '../service/bob.service.js'), 'utf8')
      let f2 = fs.readFileSync(path.join('test/logs/', './test-copy.log'), 'utf8')

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
  } else if (process.env.BINDING) {
    gateway._waitForServiceAPI('bob').then(async service => {
      try {
        await service.setMethodAsOutput('generate',
          { $userId: '200', $privileged: true })
        await gateway.bindEventToMethod('iios:bob:event:output:generate', 'transform2',
          { $userId: '200', $privileged: true })

        console.log(chalk.green('setting output and binding event ✔'))

        let generatedResult = await service.generate({ $userId: '200', $privileged: true })

        try {
          (generatedResult === 42).should.be.true()
          console.log(chalk.green('calling generate ✔'))
        } catch (err) {
          console.log(chalk.red('calling generate ✘'))
          console.log(err)
        }

        gateway._waitForService('toto', 1000).catch(async err => {  
          await gateway.unbindEventFromMethod('iios:bob:event:output:generate', 'transform2',
            { $userId: '200', $privileged: true })
          await service.unsetMethodAsOutput('generate',
            { $userId: '200', $privileged: true })

          console.log(chalk.green('unbinding event ✔'))
        })
      } catch (err) {
        console.log(chalk.red('setting output and binding/unbinding event ✘'))
        console.log(err)
      }

      gateway.bindMethods('transform', 'bob', 'generate',
        { $userId: '200', $privileged: true }).then(() => {
        console.log(chalk.green('binding a method to a remote one ✔'))
        gateway.callEventuallyBoundMethod('transform',
          { $userId: '200', $privileged: true }).then(result => {
          console.log(chalk.green('calling an eventually bound method ✔'))

          try {
            (result === 546).should.be.true()
            console.log(chalk.green('calling an eventually bound method result ✔'))
          } catch (err) {
            console.log(chalk.red('calling an eventually bound method result ✘'))
            console.log(err)
          }

          gateway.unbindMethods('transform', 'bob', 'generate',
            { $userId: '200', $privileged: true }).then(() => {
              console.log(chalk.green('unbinding a method from a remote one ✔'))

              service.callEventuallyBoundMethod('generate',
                { $userId: '200', $privileged: true }).then(result => {
                console.log(chalk.green('calling an eventually bound method from service ✔'))

                try {
                  (result === 42).should.be.true()
                  console.log(chalk.green('calling an eventually bound method from service result ✔'))
                } catch (err) {
                  console.log(chalk.red('calling an eventually bound method from service result ✘'))
                  console.log(err)
                }
              }).catch(err => {
                console.log(chalk.red('calling an eventually bound method from service ✘'))
                console.log(err)
              })
            }).catch(err => {
              console.log(chalk.red('unbinding a method from a remote one ✘'))
              console.log(err)
            })
        }).catch(err => {
          console.log(chalk.red('calling an eventually bound method ✘'))
          console.log(err)
        })
      }).catch(err => {
        console.log(chalk.red('binding a method to a remote one ✘'))
        console.log(err)
      })

      service.bindServiceEventToMethod(gateway._name, 'cocorico', 'sayYes',
        { $userId: '200', $privileged: true }).then(() => {
        console.log(chalk.green('binding an event remotely ✔'))
        gateway._pushEvent('cocorico', { toWhome: 'titi' },
          { $userId: '200', $privileged: true }).then(() => {
          service.unbindServiceEventFromMethod(gateway._name, 'cocorico',
            'sayYes', { $userId: '200', $privileged: true }).then(() => {
            console.log(chalk.green('unbinding an event remotely ✔'))
            gateway._pushEvent('cocorico', { toWhome: 'titi' },
              { $userId: '200', $privileged: true }).catch(err => {
              console.log(chalk.red('pushing an event ✘'))
              console.log(err)
            })
          }).catch(err => {
            console.log(chalk.red('unbinding an event remotely ✘'))
            console.log(err)
          })
        }).catch(err => {
          console.log(chalk.red('pushing an event ✘'))
          console.log(err)
        })
      }).catch(err => {
        console.log(chalk.red('pushing an event ✘'))
        console.log(err)
      })
    }).catch(err => {
      console.log(chalk.red('binding an event remotely ✘'))
      console.log(err)
    })
  }
}).catch(err => {
  console.log(chalk.red('gateway initialized ✘'))
  console.log(err)
})

if (!process.env.STREAMING && !process.env.BINDING) {
  if (config.pubsubRPC) {
    gateway.on('iios:event', message => {
      try {
        (message.meta.service === 'bob' || message.meta.service === 'ted').should.be.true()
        console.log(chalk.green('any push event from any ✔'))
        okNominalCounter++
      } catch (err) {
        console.log(chalk.red('any push event from any ✘'))
        console.log(err)
      }

      try {
        (message.payload.toto === 'titi').should.be.true()
        console.log(chalk.green('any push event payload ✔'))
        okNominalCounter++
      } catch (err) {
        console.log(chalk.red('any push event payload ✘'))
        console.log(err)
      }
    })

    gateway.on('iios:bob:event', message => {
      try {
        (message.meta.service === 'bob').should.be.true()
        console.log(chalk.green('any push event from bob ✔'))
        okNominalCounter++
      } catch (err) {
        console.log(chalk.red('any push event from bob ✘'))
        console.log(err)
      }
    })

    gateway.on('iios:bob:event:coucou', data => {
      try {
        (data.toto === 'titi').should.be.true()
        console.log(chalk.green('push event payload ✔'))
        okNominalCounter++
      } catch (err) {
        console.log(chalk.red('push event payload ✘'))
        console.log(err)
      }
    })

    gateway.on('iios:ted:event:coucou', data => {
      try {
        (data.toto === 'titi').should.be.true()
        console.log(chalk.green('push event payload ✔'))
        okNominalCounter++
      } catch (err) {
        console.log(chalk.red('push event payload ✘'))
        console.log(err)
      }
    })

    gateway._waitForService('bob').then(serviceInfo => {
      try {
        (serviceInfo.name === 'bob').should.be.true()
        console.log(chalk.green('found bob service ✔'))
        okNominalCounter++
      } catch (err) {
        console.log(chalk.red('found bob service ✘'))
        console.log(err)
      }

      gateway._waitForServiceAPI('bob').then(service => {
        (service !==  undefined).should.be.true()
        console.log(chalk.green('got bob service API ✔'))
        okNominalCounter++

        service.saveYes('alice', { $userId: '200' }).then(response => {
          console.log(chalk.red('get saveYes access not granted response ✘'))
        }).catch(err => {
          console.log(chalk.green('get saveYes access not granted response ✔'))
          okNominalCounter++

          try {
            (!!err.toString().match('access not granted')).should.be.true()
            console.log(chalk.green('bob\'s saveYes not granted response ✔'))
            okNominalCounter++
          } catch (err) {
            console.log(chalk.red('bob\'s saveYes not granted response ✘'))
            console.log(err)
          }
        })

        // privileged mode
        service.saveYes('alice', { $userId: '200', $privileged: true }).then(response => {
          console.log(chalk.green('privileged saveYes for bob access not granted response ✔'))
          okNominalCounter++
        }).catch(err => {
          console.log(chalk.red('privileged saveYes for bob access not granted response ✘'))
        })

        service.saveYes('alice', { $userId: 'gcrood' }).then(response => {
          console.log(chalk.green('get saveYes with gcrood response ✔'))
          okNominalCounter++

          try {
            (response === 'Yes is saved dear alice or gcrood').should.be.true()
            console.log(chalk.green('bob\'s saveYes with gcrood response ✔'))
            okNominalCounter++
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
          okNominalCounter++

          try {
            (response === 'Yes is saved dear alice or gcrood').should.be.true()
            console.log(chalk.green('bob\'s saveYes with gcrood response 2 ✔'))
            okNominalCounter++
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
          okNominalCounter++

          try {
            (response === 'Yes is in the hole dear alice or gcrood').should.be.true()
            console.log(chalk.green('bob\'s putYes response ✔'))
            okNominalCounter++
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
          okNominalCounter++

          try {
            (response === 'Yes dear alice or gcrood').should.be.true()
            console.log(chalk.green('bob\'s sayYes response ✔'))
            okNominalCounter++
          } catch (err) {
            console.log(chalk.red('bob\'s sayYes response ✘'))
            console.log(response)
          }

          service.tellUndefined({
            toWhome: 'alice'
          }, { $userId: 'gcrood' }).then(response => {
            console.log(chalk.green('get bob undefined response ✔'))
            okNominalCounter++

            try {
              (response === undefined).should.be.true()
              console.log(chalk.green('bob\'s tellUndefined response ✔'))
              okNominalCounter++
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
      okNominalCounter++

      gateway.api.ted.saveYes('alice', { $userId: 'gcrood' }).then(response => {
        console.log(chalk.green('get ted\'s saveYes response ✔'))
        okNominalCounter++

        try {
          (response === 'Yes is saved dear alice or gcrood').should.be.true()
          console.log(chalk.green('ted\'s saveYes response ✔'))
          okNominalCounter++
        } catch (err) {
          console.log(chalk.red('ted\'s saveYes response ✘'))
          console.log(response)
        }
      }).catch(err => {
        console.log(chalk.green('get ted\'s saveYes response ✔'))
        okNominalCounter++
        console.log('err', err)
      })

      gateway.api.ted.putYes({
        toWhome: 'alice'
      }, { $userId: 'gcrood' }).then(response => {
        console.log(chalk.green('get ted\'s putYes response ✔'))
        okNominalCounter++

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

      // privileged mode
      gateway.api.ted.saveYes('alice', { $userId: '200', $privileged: true }).then(response => {
        console.log(chalk.red('privileged saveYes for ted access not granted response ✘'))
      }).catch(err => {
        console.log(chalk.green('privileged saveYes for ted access not granted response ✔'))
        okNominalCounter++

        try {
          (!!err.toString().match('access not granted')).should.be.true()
          console.log(chalk.green('ted\'s privileged saveYes not granted response ✔'))
          okNominalCounter++
        } catch (err) {
          console.log(chalk.red('ted\'s privileged saveYes not granted response ✘'))
          console.log(err)
        }
      })

      // privileged mode
      gateway.api.ted.putYes({
        toWhome: 'alice'
      }, { $userId: '200', $privileged: true }).then(response => {
        console.log(chalk.green('privileged putYes for ted access not granted response ✔'))
        okNominalCounter++
      }).catch(err => {
        console.log(chalk.red('privileged putYes for ted access not granted response ✘'))
      })

      gateway.api.ted.sayYes({
        toWhome: 'alice'
      }, { $userId: 'tcrood' }).then(response => {
        console.log(chalk.green('get ted response ✔'))
        okNominalCounter++

        try {
          (response === 'Yes dear alice or tcrood').should.be.true()
          console.log(chalk.green('ted\'s sayYes response ✔'))
          okNominalCounter++
        } catch (err) {
          console.log(chalk.red('ted\'s sayYes response ✘'))
          console.log(response)
        }

        gateway.api.ted.tellNothing({ $userId: 'tcrood' }).then(async response => {
          console.log(chalk.green('get ted undefined response ✔'))
          okNominalCounter++

          try {
            (response === undefined).should.be.true()
            console.log(chalk.green('ted\'s tellUndefined response ✔'))
            okNominalCounter++
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

            let total = 12
            if (config.pubsubRPC) {
              total = 34
            }

            console.log('TOTAL OK= ' + okNominalCounter + '/' + total)
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
