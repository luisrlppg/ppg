#!/bin/bash
# PPG ERP - Iniciar servidores de desarrollo
# Uso: ./start-dev.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== PPG ERP - Iniciando servidores ==="
echo ""

# 1. Matar procesos en puertos 3000/3001
for port in 3000 3001; do
  pid=$(lsof -ti :"$port" 2>/dev/null | head -1)
  if [ -n "$pid" ]; then
    echo "Matando proceso en puerto $port (pid $pid)..."
    kill "$pid" 2>/dev/null || true
  fi
done
sleep 1

# 2. Build API
echo "=== Haciendo build de API ==="
(cd "$ROOT/apps/api" && pnpm build) && echo "API build OK" || echo "API build FALLO"

# 3. Iniciar API
echo ""
echo "=== Iniciando API (puerto 3001) ==="
(cd "$ROOT" && nohup node apps/api/dist/main.js > api.log 2>&1 &)
echo "API iniciada"
sleep 3

# 4. Iniciar Web
echo "=== Iniciando Web (puerto 3000) ==="
(cd "$ROOT/apps/web" && nohup npx next dev -p 3000 > "$ROOT/web.log" 2>&1 &)
echo "Web iniciada"
sleep 5

# 5. Verificar
echo ""
echo "=== Estado actual ==="
for port in 3000 3001; do
  pid=$(lsof -ti :"$port" 2>/dev/null | head -1)
  if [ -n "$pid" ]; then
    echo ":$port -> OK (pid $pid)"
  else
    echo ":$port -> no detectado"
  fi
done

echo ""
echo "Listo! Abre http://localhost:3000 en tu navegador."
echo "Usuario: admin | Password: admin123"
