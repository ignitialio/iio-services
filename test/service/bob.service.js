const Service = require('../../').Service

class Bob extends Service {
  constructor(options) {
    super(options)
  }

  sayYes(args, userId) {
    /* @_GET_ */
    return new Promise((resolve, reject) => {
      console.log('userId=', userId)
      resolve('Yes dear ' + args.toWhom, 0, 'something else')
    })
  }

  tellUndefined() {
    return new Promise((resolve, reject) => {
      resolve()
    })
  }
}

module.exports = Bob
