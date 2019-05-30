const Service = require('../../').Service

class Bob extends Service {
  constructor(options) {
    super(options)
  }

  sayYes({ toWhome = '' }, userId) {
    /* @_GET_ */
    return new Promise((resolve, reject) => {
      resolve('Yes dear ' + toWhome + ' or ' + userId)
    })
  }

  saveYes(toWhome, userId) {
    /* @_POST_ */
    return new Promise((resolve, reject) => {
      resolve('Yes is saved dear ' + toWhome + ' or ' + userId)
    })
  }

  putYes({ toWhome = '' }, userId) {
    /* @_PUT_ */
    return new Promise((resolve, reject) => {
      resolve('Yes is in the hole dear ' + toWhome + ' or ' + userId)
    })
  }

  killYes(toWhome, userId) {
    /* @_DELETE_ */
    return new Promise((resolve, reject) => {
      resolve({
        answer: 'Yes is killed dear ' + toWhome,
        userId: userId
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
}

module.exports = Bob