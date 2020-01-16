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
  console.log(chalk.green('GATEWAY-TEST-01-gateway initialized ✔'))
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
        await service.presetMethodArgs('parametricGenerate', [ 100 ],
          { $userId: '200', $privileged: true })

        console.log(chalk.green('GATEWAY-TEST-02-preset set ✔'))
      } catch (err) {
        console.log(chalk.red('GATEWAY-TEST-02-preset set ✘'))
      }

      try {
        var pres = await service.callEventuallyBoundMethod('parametricGenerate',
          { $userId: '200', $privileged: true })

        try {
          (pres === 4200).should.be.true()

          console.log(chalk.green('GATEWAY-TEST-03-result with args preset ✔'))
        } catch (err) {
          console.log(chalk.red('GATEWAY-TEST-03-result with args preset ✘'))
        }

        console.log(chalk.green('GATEWAY-TEST-04-call with args preset ✔'))
      } catch (err) {
        console.log(chalk.red('GATEWAY-TEST-04-call with args preset ✘'))
      }

      try {
        await service.setMethodAsOutput('generate',
          { $userId: '200', $privileged: true })
        await gateway.bindEventToMethod('iios:bob:event:output:generate', 'transform2',
          { $userId: '200', $privileged: true })

        console.log(chalk.green('GATEWAY-TEST-05-setting output and binding event ✔'))

        let generatedResult = await service.generate({ $userId: '200', $privileged: true })

        try {
          (generatedResult === 42).should.be.true()
          console.log(chalk.green('GATEWAY-TEST-07-calling generate ✔'))
        } catch (err) {
          console.log(chalk.red('GATEWAY-TEST-07-calling generate ✘'))
          console.log(err)
        }

        gateway._waitForService('toto', 1000).catch(async err => {
          await gateway.unbindEventFromMethod('iios:bob:event:output:generate', 'transform2',
            { $userId: '200', $privileged: true })
          await service.unsetMethodAsOutput('generate',
            { $userId: '200', $privileged: true })

          console.log(chalk.green('GATEWAY-TEST-08-unbinding event ✔'))
        })
      } catch (err) {
        console.log(chalk.red('GATEWAY-TEST-06-setting output and binding/unbinding event ✘'))
        console.log(err)
      }

      gateway.bindMethods('transform', 'bob', 'generate',
        { $userId: '200', $privileged: true }).then(() => {
        console.log(chalk.green('GATEWAY-TEST-09-binding a method to a remote one ✔'))
        gateway.callEventuallyBoundMethod('transform',
          { $userId: '200', $privileged: true }).then(result => {
          console.log(chalk.green('GATEWAY-TEST-10-calling an eventually bound method ✔'))

          try {
            (result === 546).should.be.true()
            console.log(chalk.green('GATEWAY-TEST-11-calling an eventually bound method result ✔'))
          } catch (err) {
            console.log(chalk.red('GATEWAY-TEST-11-calling an eventually bound method result ✘'))
            console.log(err)
          }

          gateway.unbindMethods('transform', 'bob', 'generate',
            { $userId: '200', $privileged: true }).then(() => {
              console.log(chalk.green('GATEWAY-TEST-12-unbinding a method from a remote one ✔'))

              service.callEventuallyBoundMethod('generate',
                { $userId: '200', $privileged: true }).then(result => {
                console.log(chalk.green('GATEWAY-TEST-13-calling an eventually bound method from service ✔'))

                try {
                  (result === 42).should.be.true()
                  console.log(chalk.green('GATEWAY-TEST-14-calling an eventually bound method from service result ✔'))
                } catch (err) {
                  console.log(chalk.red('GATEWAY-TEST-14-calling an eventually bound method from service result ✘'))
                  console.log(err)
                }
              }).catch(err => {
                console.log(chalk.red('GATEWAY-TEST-13-calling an eventually bound method from service ✘'))
                console.log(err)
              })
            }).catch(err => {
              console.log(chalk.red('GATEWAY-TEST-12-unbinding a method from a remote one ✘'))
              console.log(err)
            })
        }).catch(err => {
          console.log(chalk.red('GATEWAY-TEST-10-calling an eventually bound method ✘'))
          console.log(err)
        })
      }).catch(err => {
        console.log(chalk.red('GATEWAY-TEST-09-binding a method to a remote one ✘'))
        console.log(err)
      })

      service.bindServiceEventToMethod(gateway._name, 'cocorico', 'sayYes',
        { $userId: '200', $privileged: true }).then(() => {
        console.log(chalk.green('GATEWAY-TEST-15-binding an event remotely ✔'))
        gateway._pushEvent('cocorico', { toWhome: 'titi' },
          { $userId: '200', $privileged: true }).then(() => {
          service.unbindServiceEventFromMethod(gateway._name, 'cocorico',
            'sayYes', { $userId: '200', $privileged: true }).then(() => {
            console.log(chalk.green('GATEWAY-TEST-16-unbinding an event remotely ✔'))
            gateway._pushEvent('cocorico', { toWhome: 'titi' },
              { $userId: '200', $privileged: true }).catch(err => {
              console.log(chalk.red('GATEWAY-TEST-17-pushing an event ✘'))
              console.log(err)
            })
          }).catch(err => {
            console.log(chalk.red('GATEWAY-TEST-16-unbinding an event remotely ✘'))
            console.log(err)
          })
        }).catch(err => {
          console.log(chalk.red('GATEWAY-TEST-17-pushing an event ✘'))
          console.log(err)
        })
      }).catch(err => {
        console.log(chalk.red('GATEWAY-TEST-15-binding an event remotely ✘'))
        console.log(err)
      })
    }).catch(err => {
      console.log(chalk.red('service not ready'))
      console.log(err)
    })
  }
}).catch(err => {
  console.log(chalk.red('gateway initialized ✘'))
  console.log(err)
})

if (!process.env.STREAMING && !process.env.BINDING) {
  if (config.kvStoreMode) {
    gateway.on('iios:event', message => {
      try {
        (message.meta.service === 'bob' || message.meta.service === 'ted').should.be.true()
        console.log(chalk.green('GATEWAY-TEST-18-any push event from any ✔'))
        okNominalCounter++
      } catch (err) {
        console.log(chalk.red('GATEWAY-TEST-18-any push event from any ✘'))
        console.log(err)
      }

      try {
        (message.payload.toto === 'titi').should.be.true()
        console.log(chalk.green('GATEWAY-TEST-19-any push event payload ✔'))
        okNominalCounter++
      } catch (err) {
        console.log(chalk.red('GATEWAY-TEST-19-any push event payload ✘'))
        console.log(err)
      }
    })

    gateway.on('iios:bob:event', message => {
      try {
        (message.meta.service === 'bob').should.be.true()
        console.log(chalk.green('GATEWAY-TEST-20-any push event from bob ✔'))
        okNominalCounter++
      } catch (err) {
        console.log(chalk.red('GATEWAY-TEST-20-any push event from bob ✘'))
        console.log(err)
      }
    })

    gateway.on('iios:bob:event:coucou', data => {
      try {
        (data.toto === 'titi').should.be.true()
        console.log(chalk.green('GATEWAY-TEST-21-push event payload ✔'))
        okNominalCounter++
      } catch (err) {
        console.log(chalk.red('GATEWAY-TEST-21-push event payload ✘'))
        console.log(err)
      }
    })

    gateway.on('iios:ted:event:coucou', data => {
      try {
        (data.toto === 'titi').should.be.true()
        console.log(chalk.green('GATEWAY-TEST-22-push event payload ✔'))
        okNominalCounter++
      } catch (err) {
        console.log(chalk.red('GATEWAY-TEST-22-push event payload ✘'))
        console.log(err)
      }
    })

    gateway._waitForService('bob').then(serviceInfo => {
      try {
        (serviceInfo.name === 'bob').should.be.true()
        console.log(chalk.green('GATEWAY-TEST-23-found bob service ✔'))
        okNominalCounter++
      } catch (err) {
        console.log(chalk.red('GATEWAY-TEST-23-found bob service ✘'))
        console.log(err)
      }

      gateway._waitForServiceAPI('bob').then(service => {
        (service !==  undefined).should.be.true()
        console.log(chalk.green('GATEWAY-TEST-24-got bob service API ✔'))
        okNominalCounter++

        service.saveYes('alice', { $userId: '200' }).then(response => {
          console.log(chalk.red('GATEWAY-TEST-25-get saveYes access not granted response ✘'))
        }).catch(err => {
          console.log(chalk.green('GATEWAY-TEST-25-get saveYes access not granted response ✔'))
          okNominalCounter++

          try {
            (!!err.toString().match('access not granted')).should.be.true()
            console.log(chalk.green('GATEWAY-TEST-26-bob\'s saveYes not granted response ✔'))
            okNominalCounter++
          } catch (err) {
            console.log(chalk.red('GATEWAY-TEST-26-bob\'s saveYes not granted response ✘'))
            console.log(err)
          }
        })

        // privileged mode
        service.saveYes('alice', { $userId: '200', $privileged: true }).then(response => {
          console.log(chalk.green('GATEWAY-TEST-27-privileged saveYes for bob access not granted response ✔'))
          okNominalCounter++
        }).catch(err => {
          console.log(chalk.red('GATEWAY-TEST-27-privileged saveYes for bob access not granted response ✘'))
        })

        service.saveYes('alice', { $userId: 'gcrood' }).then(response => {
          console.log(chalk.green('GATEWAY-TEST-28-get saveYes with gcrood response ✔'))
          okNominalCounter++

          try {
            (response === 'Yes is saved dear alice or gcrood').should.be.true()
            console.log(chalk.green('GATEWAY-TEST-29-bob\'s saveYes with gcrood response ✔'))
            okNominalCounter++
          } catch (err) {
            console.log(chalk.red('GATEWAY-TEST-29-bob\'s saveYes with gcrood response ✘'))
            console.log(response)
          }
        }).catch(err => {
          console.log(chalk.red('GATEWAY-TEST-28-get saveYes with gcrood response ✘'))
          console.log('err', err)
        })

        service.saveYes('alice', { $userId: 'gcrood' }).then(response => {
          console.log(chalk.green('GATEWAY-TEST-30-get saveYes with gcrood response 2 ✔'))
          okNominalCounter++

          try {
            (response === 'Yes is saved dear alice or gcrood').should.be.true()
            console.log(chalk.green('GATEWAY-TEST-31-bob\'s saveYes with gcrood response 2 ✔'))
            okNominalCounter++
          } catch (err) {
            console.log(chalk.red('GATEWAY-TEST-31-bob\'s saveYes with gcrood response 2 ✘'))
            console.log(response)
          }
        }).catch(err => {
          console.log(chalk.red('GATEWAY-TEST-30-get saveYes with gcrood response 2 ✘'))
          console.log('err', err)
        })

        service.putYes({
          toWhome: 'alice'
        }, { $userId: 'gcrood' }).then(response => {
          console.log(chalk.green('GATEWAY-TEST-31-get putYes response ✔'))
          okNominalCounter++

          try {
            (response === 'Yes is in the hole dear alice or gcrood').should.be.true()
            console.log(chalk.green('GATEWAY-TEST-32-bob\'s putYes response ✔'))
            okNominalCounter++
          } catch (err) {
            console.log(chalk.red('GATEWAY-TEST-32-bob\'s putYes response ✘'))
            console.log(response)
          }
        }).catch(err => {
          console.log(chalk.red('GATEWAY-TEST-31-get putYes response ✘'))
          console.log('err', err)
        })

        service.sayYes({
          toWhome: 'alice'
        }, { $userId: 'gcrood' }).then(async response => {
          console.log(chalk.green('GATEWAY-TEST-33-get bob response ✔'))
          okNominalCounter++

          try {
            (response === 'Yes dear alice or gcrood').should.be.true()
            console.log(chalk.green('GATEWAY-TEST-34-bob\'s sayYes response ✔'))
            okNominalCounter++
          } catch (err) {
            console.log(chalk.red('GATEWAY-TEST-34-bob\'s sayYes response ✘'))
            console.log(response)
          }

          service.tellUndefined({
            toWhome: 'alice'
          }, { $userId: 'gcrood' }).then(response => {
            console.log(chalk.green('GATEWAY-TEST-35-get bob undefined response ✔'))
            okNominalCounter++

            try {
              (response === undefined).should.be.true()
              console.log(chalk.green('GATEWAY-TEST-36-bob\'s tellUndefined response ✔'))
              okNominalCounter++
            } catch (err) {
              console.log(chalk.red('GATEWAY-TEST-36-bob\'s tellUndefined response ✘'))
              console.log(response)
            }
          }).catch(err => {
            console.log(chalk.red('GATEWAY-TEST-35-get bob undefined response ✘'))
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
          console.log(chalk.red('GATEWAY-TEST-33-get bob response ✘'))
          console.log('err', err)
        })
      }).catch(err => {
        console.log(chalk.red('GATEWAY-TEST-24-got bob service API ✘'))
        console.log(err)
      })
    }).catch(err => {
      console.log(chalk.red('GATEWAY-TEST-23-found bob service ✘'))
    })
  }

  gateway.on('service:registered', (serviceName, serviceInfo) => {
    if (serviceName === 'ted') {
      console.log(chalk.green('GATEWAY-TEST-34-ted service registered ✔'))
      okNominalCounter++

      gateway.api.ted.saveYes('alice', { $userId: 'gcrood' }).then(response => {
        console.log(chalk.green('GATEWAY-TEST-35-get ted\'s saveYes response ✔'))
        okNominalCounter++

        try {
          (response === 'Yes is saved dear alice or gcrood').should.be.true()
          console.log(chalk.green('GATEWAY-TEST-36-ted\'s saveYes response ✔'))
          okNominalCounter++
        } catch (err) {
          console.log(chalk.red('GATEWAY-TEST-36-ted\'s saveYes response ✘'))
          console.log(response)
        }
      }).catch(err => {
        console.log(chalk.green('GATEWAY-TEST-35-get ted\'s saveYes response ✔'))
        okNominalCounter++
        console.log('err', err)
      })

      gateway.api.ted.putYes({
        toWhome: 'alice'
      }, { $userId: 'gcrood' }).then(response => {
        console.log(chalk.green('GATEWAY-TEST-37-get ted\'s putYes response ✔'))
        okNominalCounter++

        try {
          (response === 'Yes is in the hole dear alice or gcrood').should.be.true()
          console.log(chalk.green('GATEWAY-TEST-38-ted\'s putYes response ✔'))
        } catch (err) {
          console.log(chalk.red('GATEWAY-TEST-38-ted\'s putYes response ✘'))
          console.log(response)
        }
      }).catch(err => {
        console.log(chalk.green('GATEWAY-TEST-37-get ted\'s putYes response ✘'))
        console.log('err', err)
      })

      // privileged mode
      gateway.api.ted.saveYes('alice', { $userId: '200', $privileged: true }).then(response => {
        console.log(chalk.red('GATEWAY-TEST-38-privileged saveYes for ted access not granted response ✘'))
      }).catch(err => {
        console.log(chalk.green('GATEWAY-TEST-38-privileged saveYes for ted access not granted response ✔'))
        okNominalCounter++

        try {
          (!!err.toString().match('access not granted')).should.be.true()
          console.log(chalk.green('GATEWAY-TEST-39-ted\'s privileged saveYes not granted response ✔'))
          okNominalCounter++
        } catch (err) {
          console.log(chalk.red('GATEWAY-TEST-39-ted\'s privileged saveYes not granted response ✘'))
          console.log(err)
        }
      })

      // privileged mode
      gateway.api.ted.putYes({
        toWhome: 'alice'
      }, { $userId: '200', $privileged: true }).then(response => {
        console.log(chalk.green('GATEWAY-TEST-40-privileged putYes for ted access not granted response ✔'))
        okNominalCounter++
      }).catch(err => {
        console.log(chalk.red('GATEWAY-TEST-40-privileged putYes for ted access not granted response ✘'))
      })

      gateway.api.ted.sayYes({
        toWhome: 'alice'
      }, { $userId: 'tcrood' }).then(response => {
        console.log(chalk.green('GATEWAY-TEST-41-get ted response ✔'))
        okNominalCounter++

        try {
          (response === 'Yes dear alice or tcrood').should.be.true()
          console.log(chalk.green('GATEWAY-TEST-42-ted\'s sayYes response ✔'))
          okNominalCounter++
        } catch (err) {
          console.log(chalk.red('GATEWAY-TEST-42-ted\'s sayYes response ✘'))
          console.log(response)
        }

        gateway.api.ted.tellNothing({ $userId: 'tcrood' }).then(async response => {
          console.log(chalk.green('GATEWAY-TEST-43-get ted undefined response ✔'))
          okNominalCounter++

          try {
            (response === undefined).should.be.true()
            console.log(chalk.green('GATEWAY-TEST-44-ted\'s tellUndefined response ✔'))
            okNominalCounter++
          } catch (err) {
            console.log(chalk.red('GATEWAY-TEST-44-ted\'s tellUndefined response ✘'))
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
            if (config.kvStoreMode) {
              total = 34
            }

            console.log('TOTAL OK= ' + okNominalCounter + '/' + total)
          } catch (err) {
            console.log(chalk.red('stress test ✘'))
            console.log(err)
          }

          console.log('++++  END STRESS TEST  ++++')
        }).catch(err => {
          console.log(chalk.green('GATEWAY-TEST-43-get ted undefined response ✘'))
          console.log('err', err)
        })
      }).catch(err => {
        console.log(chalk.green('GATEWAY-TEST-41-get ted response ✘'))
        console.log('err', err)
      })
    }
  })
}
