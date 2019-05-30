FROM node:12-alpine

RUN npm install pm2 -g

RUN mkdir -p /opt && mkdir -p /opt/svc

WORKDIR /opt/svc

CMD ["pm2-docker", "test/gateway/index.js"]
