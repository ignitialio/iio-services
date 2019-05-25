module.exports = {
  /* service namesapce */
  namespace: process.env.IIOS_NAMESPACE || 'iios',
  /* redis server connection */
  redis: {
    host: '127.0.0.1',
    port: 6379,
    db: 0
  },
  /* HTTP server declaration */
  server: {
    /* server host */
    host: '127.0.0.1',
    /* server port */
    port: 21013,
    /* path to statically serve (at least one asset for icons for example) */
    path: './dist'
  },
  /* see connect-rest */
  rest: {
    context: '/api',
    apiKeys: []
  },
  /* options published through discovery mechanism */
  publicOptions: {}
}
