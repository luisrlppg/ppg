#!/bin/sh
# Entrypoint de la API (imagen recortada): aplica migraciones pendientes y arranca NestJS.
# El layout viene de `pnpm deploy`: la raíz /app es el paquete @ppg/api.
set -e

cd /app
node node_modules/prisma/build/index.js migrate deploy \
  --schema node_modules/@ppg/db/prisma/schema.prisma

exec node dist/main.js
