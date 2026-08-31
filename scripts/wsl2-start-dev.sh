#!/bin/bash
# PPG ERP - WSL2 Development Server Starter
# Ejecutar desde ~/ppg-erp/

set -e

PROJECT_DIR="${HOME}/ppg-erp"

if [ ! -d "$PROJECT_DIR" ]; then
    echo "Error: No se encontró el proyecto en $PROJECT_DIR"
    echo "Copia el proyecto a $PROJECT_DIR o ajusta PROJECT_DIR en este script."
    exit 1
fi

cd "$PROJECT_DIR"

echo "=== PPG ERP: Iniciando servidores ==="
echo ""

# Verificar que Docker está corriendo
if ! docker ps > /dev/null 2>&1; then
    echo "ADVERTENCIA: Docker no está corriendo."
    echo "Inicia Docker Desktop en Windows y espera a que esté listo."
    echo ""
    read -p "Presiona Enter cuando Docker esté corriendo..."
fi

# Configurar DATABASE_URL para apuntar al Docker de Windows
export DATABASE_URL="postgresql://ppg:ppg@host.docker.internal:5433/ppg"

echo "[1/4] Verificando dependencias..."
if ! command -v pnpm &> /dev/null; then
    echo "Error: pnpm no está instalado"
    echo "Ejecuta: curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && npm install -g pnpm"
    exit 1
fi

echo "[2/4] Verificando node_modules..."
if [ ! -d "node_modules" ]; then
    echo "Instalando dependencias..."
    pnpm install
fi

echo "[3/4] Haciendo build del API..."
cd apps/api
pnpm build
cd ../..

echo "[4/4] Iniciando servidores..."
echo ""
echo "Iniciando API (puerto 3001)..."
pnpm --filter @ppg/api dev &
API_PID=$!

sleep 3

echo "Iniciando Web (puerto 3000)..."
pnpm --filter @ppg/web dev &
WEB_PID=$!

echo ""
echo "=== SERVIDORES INICIADOS ==="
echo "API:    http://localhost:3001"
echo "Web:    http://localhost:3000"
echo "Admin:  http://localhost:3000/admin/productos"
echo ""
echo "Usuario: admin | Password: admin123"
echo ""
echo "Presiona Ctrl+C para detener los servidores"
echo ""

# Wait for both processes
wait $API_PID $WEB_PID
