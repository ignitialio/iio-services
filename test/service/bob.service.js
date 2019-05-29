const Service = require('../../').Service

class Bob extends Service {
  constructor(options) {
    super(options)
  }

  sayYes(args, userId) {
    /* @_GET_ */
    return new Promise((resolve, reject) => {
      // console.log('userId=', userId)
      resolve('Yes dear ' + args.toWhome + ' or ' + userId)
    })
  }

  saveYes(args, userId) {
    /* @_POST_ */
    return new Promise((resolve, reject) => {
      // console.log('userId=', userId)
      resolve('Yes is saved dear ' + args.toWhome + ' or ' + userId)
    })
  }

  putYes(args, userId) {
    /* @_PUT_ */
    return new Promise((resolve, reject) => {
      // console.log('userId=', userId)
      resolve('Yes is in the hole dear ' + args.toWhome + ' or ' + userId)
    })
  }

  killYes(args, userId) {
    /* @_DELETE_ */
    return new Promise((resolve, reject) => {
      // console.log('userId=', userId)
      resolve({
        answer: 'Yes is killed dear ' + args.toWhome,
        userId: userId
      })
    })
  }

  tellUndefined() {
    return new Promise((resolve, reject) => {
      resolve()
    })
  }
}

module.exports = Bob
