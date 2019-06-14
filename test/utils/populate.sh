#!/bin/sh

#export DEBUG=iios:*
docker-compose up -d redis

export IIOS_NAMESPACE=testings
node test/utils/populate.js

docker-compose stop redis
docker-compose rm -f redis
