module.exports = {
  /* PUB/SUB/KV connector*/
  connector: {
    /* redis server connection */
    redis: {
      host: '127.0.0.1',
      port: 6379,
      db: 0,
      ipFamily: 4
    }
  }
  /* service namesapce */
  namespace: process.env.IIOS_NAMESPACE || 'iios',
  /* HTTP server declaration */
  server: {
    /* server host */
    host: '127.0.0.1',
    /* server port */
    port: 21013,
    /* path to statically serve (at least one asset for icons for example) */
    path: './dist'
  },
  /* options published through discovery mechanism */
  publicOptions: {}
}
