#!/bin/sh
# Entrypoint de la API: aplica migraciones pendientes y arranca NestJS.
set -e

cd /app/packages/db
node node_modules/prisma/build/index.js migrate deploy

cd /app
exec node apps/api/dist/main.js
