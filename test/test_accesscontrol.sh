#!/bin/sh

# export DEBUG=iios:*
export IIOS_NAMESPACE=testings
docker-compose up -d redis
sleep 1
node test/test_accesscontrol.js
sleep 1
docker-compose stop redis
docker-compose rm -f redis
