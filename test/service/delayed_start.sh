#!/bin/sh

sleep $1
pm2-docker test/service/index.js
