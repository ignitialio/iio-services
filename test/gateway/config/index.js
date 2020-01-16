let REDIS_SENTINELS

if (process.env.REDIS_SENTINELS) {
  REDIS_SENTINELS = []
  let sentinels = process.env.REDIS_SENTINELS.split(',')
  for (let s of sentinels) {
    REDIS_SENTINELS.push({ host: s.split(':')[0], port: s.split(':')[1] })
  }
}

module.exports = {
  /* service name */
  name: 'alice',
  /* eventually only use HTTP (degraded mode), so no push events */
  kvStoreMode: process.env.KV_STORE_MODE,
  /* uses HTTP for RPC calls, instead of pub/sub: default for ^3.0.0  */
  httpRPC: process.env.HTTP_RPC,
  /* discovery servers (gateways) when HTTP only */
  discoveryServers: [],
  /* calling timeout for pub/sub mode */
  timeout: 3000,
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
      host: process.env.REDIS_HOST,
      master: process.env.REDIS_MASTER_NAME,
      sentinels: REDIS_SENTINELS, /* uses redis sentinel if defined */
      port: 6379,
      db: 0,
      ipFamily: 4
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
