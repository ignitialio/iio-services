FROM node:12-alpine

RUN mkdir -p /opt && mkdir -p /opt/svc

WORKDIR /opt/svc

CMD ["node", "test/gateway/index.js"]
