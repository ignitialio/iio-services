# IgnitialIO Services (IIOS)

> __WARNING !__
>  
> IIOS v2 is not compliant with IIOS v1

Micro-services framework. Base brick for IgnitialIO toolbox that aims to provide
everything needed to build resilient complex systems based on web technologies.

It is:
- cloud ready: naturally works with Docker, Kubernetes etc.
- edge/embedded computing ready: provide a cloud extension deploying micro-services
within a data center, as well as on embedded or edge targets
- simple, reliable, easy to maintain (~ 1600 SLOCs)
- production ready: well tested, easy to deploy, easy to use
- in one word, resilient: few mandatory dependecies, works with Redis, but can
replace Redis with any KV store + pub/sub broker, manages complexity with simple
solutions

Main features:
- namespaced micro-services
- RPC based services intercall (~ 5000 calls/sec on i7 8th generation - one core used)
- HTTP backup services intercall (can work without KV store + pub/sub broker)
- inter-services streaming (data pipes, etc.)
- inter-services events
- maps any service methods to any gateway with a given namespace
- distributed Role Based Access Control
- UI injection (if used in the IgnitialIO web app framework context)
- workflow ready with inter-services functions, events and stream binding

## Get started

Any service can call any other. In order to do so, caller has to be a _gateway_
which is a special service that offers an API for calling remote services:

Gateway side:

```javascript
const Gateway = require('@ignitial/iio-services').Gateway
const config = require('./config')

let gateway = new Gateway(config)

gateway._init().then(() => {  
  gateway._waitForService('bob').then(serviceInfo => {
    console.log(serviceInfo)

    gateway.api.bob.bobAwesomeMethod(p1, p2, { $userId: <ifany> }).then(response => {
      console.log(response)
    }).catch(err => console.log('service failed with err', err))
}).catch(err) {...}

```

Service side:

```javascript
const Service = require('../../').Service

class Bob extends Service {
  constructor(options) {
    super(options)
  }

  bobAwesomeMethod(p1, p2, userId) {
    /* @_GET_ */
    return new Promise((resolve, reject) => {
      resolve('got ' + p1 + ', ' + p2)
    })
  }
}

let bob = new Bob(config)
bob._init().then(() => { }).catch(err => {})
```

### Inter-services events

Subscriber side:  

```javascript
gateway._init().then(() => {  
  // given event fro given service
  gateway.on('iios:bob:event:coucou', data => {
    console.log(data) // effective payload == data
  })

  // or any event from a given service
  gateway.on('iios:bob:event', message => {
    console.log(message.meta) // message meta information
    console.log(message.payload) // effective payload == data
  })

  // or any event from any service
  gateway.on('iios:event', data => {
    console.log(message.meta) // message meta information
    console.log(message.payload) // effective payload == data
  })
}).catch(err) {...}
```

Publisher side:

```javascript
let bob = new Bob(config)
bob._init().then(() => {
  bob._pushEvent('coucou', { toto: 'titi' })
}).catch(err => {})
```

## Methods declaration

Any class method declared without '_' or '$' characters as first one in the name
and different from reserved methods (mainly NodeJS EventEmitter's public méthods)
are automatically callable once service initialized.

An additional info (here: __/* @_GET_ */__) can be provided to tel the service
that refered method is one of _get_, _put_, _post_ or _delete_ HTTP call types.

By default, is considered as _post_, but not available to HTTP backup API. This means
that a method for which no information has been provided, cannot be called through
HTTP API mechanism, but only through pub/sub using the broker if available.

## Service options

Options example:

```javascript  
{  
  /* service name */
  name: 'alice',
  /* eventually disables pub/sub calling mechanism in order to use only HTTP */
  pubsubRPC: process.env.PUBSUB_RPC,
  /* discovery servers (gateways) when HTTP only */
  discoveryServers: [],
  /* calling timeout for pub/sub mode */
  timeout: 500,
  /* metrics configuration: no metrics if undefined */
  metrics: {
    /* number of points that triggers metrics push event */
    pushTrigger: 100,
    /* maw number of points to store locally */
    maxPoints: 100
  },
  /* PUB/SUB/KV connector */
  connector: {
    /* redis server connection */
    redis: {
      /* encoder to be used for packing/unpacking raw messages */
      encoder: process.env.ENCODER || 'json',
      /* redis host ip or hostname */
      host: process.env.REDIS_HOST,
      /* if redis sentinel enabled, master name */
      master: process.env.REDIS_MASTER_NAME,
      /* uses redis sentinel if defined */
      sentinels: REDIS_SENTINELS,
      /* redis port */
      port: 6379,
      /* redis db number */
      db: 0,
      /* ip family */
      ipFamily: 4
    }
  },
  /* access control: if present, acces control enabled */
  accesscontrol: {
    /* grants for current service: auto-fill */
    grants: {
      admin: {
        'create:any': [ '*' ],
        'read:any': [ '*' ],
        'update:any': [ '*' ],
        'delete:any': [ '*' ]
      },
      user: {
        'read:any': [ '*' ],
        'update:any': [ '*' ],
        'delete:any': [ '*' ]
      },
      anonymous: {
        'read:any': [ '*' ]
      }
    },
    /* access control namespace */
    namespace: process.env.IIOS_NAMESPACE || 'iios',
    /* connector configuration: optional, default same as global connector, but
       on DB 1 */
    connector: {
      /* redis server connection */
      redis: {
        host: process.env.REDIS_HOST,
        port: 6379,
        db: 1,
        ipFamily: 4
      }
    }
  },
  /* service namesapce */
  namespace: process.env.IIOS_NAMESPACE || 'iios',
  /* HTTP server declaration */
  server: {
    /* server host for external call */
    host: process.env.IIOS_SERVER_HOST,
    /* server port */
    port: process.env.IIOS_SERVER_PORT,
    /* indicates that service is behind an HTTPS proxy */
    https: false,
    /* path to statically serve (at least one asset for icons for example) */
    path: './dist'
  },
  /* options published through discovery mechanism */
  publicOptions: {}
}
```

## Access control

If option is activated, any call will have to get clearence from a local access
control mechanism based on roles stored in the KV store.

Each user id has a corresponding role. No user id means _anonymous_ role.

Services use user id and not tokens, since tokens have to enforce auth and access
control only at the web app level.

A typical access control definition would be:

```javascript
admin: {
  'bob': {
    'create:any': [ '*' ],
    'read:any': [ '*' ],
    'update:any': [ '*' ],
    'delete:any': [ '*' ]
  },
  ...
}
```

which means that role _admin_ can:
- create:any === make PUT calls
- read:any === make GET calls
- update:any === make POST calls
- delete:any === make DELETE calls
to the service _bob_.

## Tests

### Lint

```bash
npm run lint
```

### Prepare test image

```bash
npm run config:build
```

### Access control

```bash
npm run test:accesscontrol
```

### Service

Tests basique service features.

```bash
npm run test:service
```

### Services

Tests service call from gateway using pub/sub primary mechanism.

```bash
npm run test:services
```

### Services in HTTP mode

Tests service call from gateway using HTTP backup mechanism.

```bash
npm run test:services:http
```

### Streaming

Tests service streaming.

```bash
npm run test:streams
```
