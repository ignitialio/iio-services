const chalk = require('chalk')

const Service = require('../../').Service

class Bob extends Service {
  constructor(options) {
    super(options)
  }

  sayYes({ toWhome = '' }, grants) {
    /* @_GET_ */
    return new Promise((resolve, reject) => {
      resolve('Yes dear ' + toWhome + ' or ' + grants.$userId)
      if (process.env.BINDING) {
        console.log(chalk.green('binding worked ✔'))
      }
    })
  }

  saveYes(toWhome, grants) {
    /* @_POST_ */
    return new Promise((resolve, reject) => {
      resolve('Yes is saved dear ' + toWhome + ' or ' + grants.$userId)
    })
  }

  putYes({ toWhome = '' }, grants) {
    /* @_PUT_ */
    return new Promise((resolve, reject) => {
      resolve('Yes is in the hole dear ' + toWhome + ' or ' + grants.$userId)
    })
  }

  killYes(toWhome, grants) {
    /* @_DELETE_ */
    return new Promise((resolve, reject) => {
      resolve({
        answer: 'Yes is killed dear ' + toWhome,
        userId: grants.$userId
      })
    })
  }

  tellNothing() {
    /* @_GET_ */
    return new Promise((resolve, reject) => {
      resolve()
    })
  }

  tellUndefined() {
    return new Promise((resolve, reject) => {
      resolve()
    })
  }

  generate() {
    return new Promise((resolve, reject) => {
      resolve(42)
    })
  }
}

module.exports = Bob
