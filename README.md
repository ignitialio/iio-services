Basic service discovery and gateway for both PUB/SUB and HTTP RPC emulation.

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
