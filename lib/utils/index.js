'use strict'

const _RESERVED_METHODS = [
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  'toString',
  'valueOf',
  'name',
  'addListener',
  'emit',
  'eventNames',
  'getMaxListeners',
  'listenerCount',
  'listeners',
  'on',
  'off',
  'once',
  'prependListener',
  'prependOnceListener',
  'removeAllListeners',
  'removeListener',
  'setMaxListeners',
  'rawListeners'
]

const getMethods = obj => {
  let props = []

  do {
    const l = Object.getOwnPropertyNames(obj)
      .concat(Object.getOwnPropertySymbols(obj).map(s => s.toString()))
      .sort()
      .filter((p, i, arr) => {
        try {
          return !p.match(/arguments|caller/) && /* ignore strict mode restrictions */
            typeof obj[p] === 'function' && /* only the methods */
            p !== 'constructor' && /* not the constructor */
            (i === 0 || p !== arr[i - 1]) && /* not overriding in this prototype */
            p[0] !== '_' && /* not internals */
            p[0] !== '$' && /* not injected */
            _RESERVED_METHODS.indexOf(p) === -1 && /* not reserved */
            props.indexOf(p) === -1 /* not overridden in a child */
        } catch (err) {
          return false
        }
      })

    props = props.concat(l)
  } while (
    (obj = Object.getPrototypeOf(obj)) && /* walk-up the prototype chain */
    Object.getPrototypeOf(obj) /* not the the Object prototype methods (hasOwnProperty, etc...) */
  )

  return props
}

/* wait for a property to be set to a specific value for a given object */
const waitForPropertySet = (obj, name, value, delay = 5000) => {
  return new Promise((resolve, reject) => {
    var checkTimeout

    var checkInterval = setInterval(() => {
      if (obj[name] === value) {
        clearInterval(checkInterval)
        clearTimeout(checkTimeout) // nothing if undefined

        resolve(obj[name])
      }
    }, 100)

    checkTimeout = setTimeout(() => {
      if (checkInterval) {
        clearInterval(checkInterval)
        reject(new Error('timeout: property [' + name +
        '] has not been set to requested value'))
      }
    }, delay)
  })
}

/* wait for obj property to be defined */
const waitForPropertyInit = (obj, name, delay) => {
  delay = delay || 5000

  return new Promise((resolve, reject) => {
    let checkTimeout

    let checkInterval = setInterval(() => {
      if (obj[name] !== undefined) {
        clearInterval(checkInterval)
        clearTimeout(checkTimeout) // nothing if undefined

        resolve(obj[name])
      }
    }, 100)

    checkTimeout = setTimeout(() => {
      if (checkInterval) {
        clearInterval(checkInterval)
        reject(new Error('timeout: [' + name + '] property is not available'))
      }
    }, delay)
  })
}

const compareDates = (d1, d2) => {
  if (typeof d1 === 'string') {
    d1 = (new Date(d1)).getTime()
  }

  if (typeof d2 === 'string') {
    d2 = (new Date(d2)).getTime()
  }

  if (d1 > d2) return -1
  else if (d1 < d2) return 1
  else return 0
}

const uuid = () => {
  return Math.random().toString(36).slice(2)
}

exports.getMethods = getMethods
exports.waitForPropertySet = waitForPropertySet
exports.waitForPropertyInit = waitForPropertyInit
exports.compareDates = compareDates
exports.uuid = uuid
