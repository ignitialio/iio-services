#!/bin/sh

# export DEBUG=iios:*
export ENCODER=bson
export IIOS_NAMESPACE=testings
docker-compose up -d redis
sleep 1
node test/test_access_autofill.js
sleep 1
docker-compose stop redis
docker-compose rm -f redis
