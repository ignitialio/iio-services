const Service = require('../lib/service').Service;
const config = require('./config');

let service = new Service(config);
service._registerMethods().then(() => {
  console.log('I AM ' + service.name);

  service._getAvailableNSServices().then(services => {
    console.log('services', services)
  })
});

process.on('SIGINT', () => {
  service._destroy();
  process.exit()
});

process.on('SIGTERM', () => {
  service._destroy();
  process.exit()
});

service.on('service:up', service => {
  console.log('up', service);
});

service.on('service:down', service => {
  console.log('down', service);
});
