#!/bin/sh
set -eu
mkdir -p /app/data
chown node:node /app/data
exec runuser -u node -- node /app/src/cloud-check.mjs
