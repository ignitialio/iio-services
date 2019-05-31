# IgnitionIO Services (IIOS)

Micro-services framework. Base brick for IgnitialIO toolbox that aims to provide
everything needed to build resilient complex systems based on web technologies.

It is:
- cloud ready: naturally work with Docker, Kubernetes etc.
- edge/embedded computing ready: provide a cloud extension deploying micro-services
within a data center, as well as on embedded or edge targets
- simple, reliable, easy to maintain (development workcharge for version 2 rework
was about 5 Man.days for current brick, including docs, tests etc.)
- production ready: well tested, easy to deploy, easy to use
- in one word, resilient: few mandatory dependecies, works with Redis, but can
replace Redis with any KV store + Pub/sub broker, manages complexity with simple
solutions

Main features:
- namespaced micro-services
- maps any service methods to any gateway with a given namespace. If you have a
service called deployed

## Service usage

Options example:

```javascript
{
  /* service namesapce */
  namespace: process.env.IIOS_NAMESPACE || 'mynamespace',
  /* redis server connection */
  redis: {
    host: '127.0.0.1',
    port: 6379,
    db: 0
  },
  /* HTTP server declaration */
  server: {
    /* server host */
    host: HOST,
    /* server port */
    port: PORT,
    /* path to statically serve (at least one asset for icons for example) */
    path: './dist'
  },
  /* see connect-rest */
  rest: {
    context: '/api',
    apiKeys: [ '....' ]
  },
  /* options published through discovery mechanism */
  publicOptions: {
    /* Ignitial.io Web app access rights */
    accessRights: {
      owner: 'admin',
      group: 'admin',
      access: {
        owner: 'rw',
        group: 'rw',
        all: 'rw',
      }
    },
    /* declares component injection */
    uiComponentInjection: true,
    /* service description */
    description: {
      /* service icon */
      icon: 'assets/weather-64.png',
      /* Internationalization: see Ignitial.io Web App */
      i18n: {
        'City': [ 'Localité' ],
        'Weather forecast': [ 'Prévisions météo' ]
        'Provides weather forecast for a given location':  [
          'Fournit les prévisions météo pour un endroit donné'
        ]
      },
      /* eventually any other data */
      title: 'Weather forecast',
      info: 'Provides weather forecast for a given location'
    }
  }
}
```

## Tests

See tests for few examples.
