const fs = require('fs')
const path = require('path')
const should = require('should')
const chalk = require('chalk')

const ConnectorFactory = require('../lib/connectors').ConnectorFactory

let connectorFactory = new ConnectorFactory()
let connectorsList = connectorFactory.list()

let keyEvent = false

try {
  (connectorsList.length === 1).should.be.true()
  console.log(chalk.green('connectors registering ✔'))
} catch (err) {
  console.log(chalk.red('connectors registering ✘'))
}

let onPEvent = (pattern, channel, info) => {
  try {
    (info === 'titi').should.be.true()
    console.log(chalk.green('[mam*ia] event [titi] ✔'))
  } catch (err) {
    console.log(chalk.red('[mam*ia] event [titi] ✘'))
  }

  redisConnector.punsubscribe('mam*ia').then(info => {
    try {
      (info.patterns === 2 && info.currentPatternSubscriptions === 0).should.be.true()
      console.log(chalk.green('[mam*ia] unsubscription ✔'))
    } catch (err) {
      console.log(chalk.red('[mam*ia] unsubscription ✘'))
      console.log(err)
    }
  }).catch(err => {
    console.log(chalk.red('[mam*ia] unsubscription ✘'))
    console.log(err)
  })
}

let onEvent = (channel, info) => {
  try {
    (info === 'titi').should.be.true()
    console.log(chalk.green('[mamamia] event [titi] ✔'))
  } catch (err) {
    console.log(chalk.red('[mamamia] event [titi] ✘'))
  }

  redisConnector.set('iios:iios:mamamia', 'toto').then(value1 => {
    try {
      (value1 === 'toto').should.be.true()
      console.log(chalk.green('[iios:iios:mamamia] set ✔'))
    } catch (err) {
      console.log(chalk.red('[iios:iios:mamamia] set ✘'))
    }

    redisConnector.get('iios:iios:mamamia').then(value2 => {
      try {
        (value1 === value2).should.be.true()
        console.log(chalk.green('[iios:iios:mamamia] get ✔'))
      } catch (err) {
        console.log(chalk.red('[iios:iios:mamamia] get ✘'))
      }

      redisConnector.mget([ 'iios:iios:mamamia' ]).then(valueArr => {
        try {
          (valueArr[0] === value2).should.be.true()
          console.log(chalk.green('[iios:iios:mamamia] multiple get ✔'))
        } catch (err) {
          console.log(chalk.red('[iios:iios:mamamia] multiple get ✘'))
          console.log(err)
        }

        redisConnector.del('iios:iios:mamamia').then(async () => {
          try {
            ((await redisConnector.get('iios:iios:mamamia')) === null).should.be.true()
            console.log(chalk.green('[iios:iios:mamamia] del ✔'))
          } catch (err) {
            console.log(chalk.red('[iios:iios:mamamia] del ✘'))
          }

          redisConnector.unsubscribe('mamamia').then(info => {
            try {
              (info.channels === 1 && info.currentChannelSubscriptions === 0).should.be.true()
              console.log(chalk.green('[mamamia] unsubscription ✔'))
            } catch (err) {
              console.log(chalk.red('[mamamia] unsubscription ✘'))
              console.log(err)
            }

            setTimeout(() => {
              redisConnector.destroy().then(() => {
                console.log(chalk.green('connector destroyed ✔'))

                if (keyEvent) {
                  console.log(chalk.green('key event ✔'))
                } else {
                  console.log(chalk.red('key event ✘'))
                }
              }).catch(err => {
                console.log(chalk.green('connector destroyed ✘'))
              })
            }, 1000)
          }).catch(err => {
            console.log(chalk.red('[mamamia] unsubscription ✘'))
            console.log(err)
          })
        }).catch(err => {
          console.log(chalk.red('[iios:iios:mamamia] del ✘'))
        })
      }).catch(err => {
        console.log(chalk.red('[iios:iios:mamamia] multiple get ✘'))
        console.log(err)
      })
    }).catch(err => {
      console.log(chalk.green('[iios:iios:mamamia] get ✘'))
    })
  }).catch(err => {
    console.log(chalk.red('[iios:iios:mamamia] set ✘'))
  })
}

// default options
let redisConnector = connectorFactory.getConnectorInstance('redis')

redisConnector.on('error', err => {
  console.log(err)
})

redisConnector.on('connect', who => {
  console.log(chalk.green('[' + who + '] connected to server ✔'))
})

redisConnector.on('end', who => {
  console.log(chalk.green('[' + who + '] disconnected from server ✔'))
})

redisConnector.subscribeKVEvents('iios:*').then((pattern, db) => {
  console.log(chalk.green('subscribed keyspace events for pattern [' +
    pattern + '] and db [' +  db + '] ✔'))

  redisConnector.on('key', (key, operation) => {
    try {
      (key === 'iios:iios:mamamia' &&
        (operation === 'set' || operation === 'del')).should.be.true()
      keyEvent = true
    } catch (err) {
      console.log(chalk.red('key event ✘'))
    }
  })

  redisConnector.subscribe('mamamia', onEvent).then(info => {
    console.log(chalk.green('subscribed channel [mamamia] ✔'))
    try {
      (info.channels === 2 && info.currentChannelSubscriptions === 1).should.be.true()
      console.log(chalk.green('[mamamia] subscription ✔'))
    } catch (err) {
      console.log(chalk.red('[mamamia] subscription ✘'))
    }

    redisConnector.psubscribe('mam*ia', onPEvent).then(iinfo => {
      console.log(chalk.green('subscribed pattern [mam*ia] ✔'))
      try {
        (iinfo.patterns === 3 && iinfo.currentPatternSubscriptions === 1).should.be.true()
        console.log(chalk.green('[mam*ia] psubscription ✔'))
      } catch (err) {
        console.log(chalk.red('[mam*ia] psubscription  ✘'))
        console.log(iinfo)
      }

      redisConnector.publish('mamamia', 'titi').then(() => {
        console.log(chalk.green('published [titi] on channel [mamamia] ✔'))
      }).catch(err => {
        console.log(chalk.red('published [titi] on channel [mamamia] ✘'))
      })
    }).catch(err => {
      console.log(chalk.red('subscribed pattern [mam*ia] ✘'))
      console.log(err)
    })
  }).catch(err => {
    console.log(chalk.red('subscribed channel [mamamia] ✘'))
  })
}).catch(err => {
  console.log(chalk.red('subscribed keyspace events for pattern [' +
    pattern + '] and db [' +  db + '] ✘'))
})
