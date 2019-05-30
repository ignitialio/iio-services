#!/bin/sh

#export DEBUG=-removethis-iios:*
export DEBUG=iios:*
docker-compose up > test-services.log 2>&1 &
sleep 20
docker-compose stop alice
docker-compose stop bob
docker-compose stop ted
sleep 1
docker-compose rm -f alice bob ted
sleep 1
docker-compose stop redis
docker-compose rm -f redis
