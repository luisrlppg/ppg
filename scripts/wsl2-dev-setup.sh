#!/bin/bash
# PPG ERP - WSL2 Development Environment Setup
# Ejecutar UNA VEZ dentro de Ubuntu WSL2 después de crear el usuario

set -e

echo "=== PPG ERP: WSL2 Dev Setup ==="

# 1. Actualizar Ubuntu
echo "[1/7] Actualizando Ubuntu..."
sudo apt update && sudo apt upgrade -y

# 2. Instalar herramientas base
echo "[2/7] Instalando herramientas..."
sudo apt install -y curl git unzip build-essential

# 3. Instalar Node.js 20 LTS
echo "[3/7] Instalando Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version

# 4. Instalar pnpm
echo "[4/7] Instalando pnpm..."
npm install -g pnpm
pnpm --version

# 5. Instalar Docker CLI para WSL2
echo "[5/7] Instalando Docker CLI..."
sudo apt install -y docker.io
sudo usermod -aG docker $USER
echo "Docker instalado. Asegúrate que Docker Desktop esté corriendo en Windows."

# 6. Clonar o copiar el proyecto
echo "[6/7] Configurando proyecto..."
WORKDIR=~/ppg-erp
if [ -d "$WORKDIR" ]; then
    echo "El proyecto ya existe en $WORKDIR"
else
    echo "Creando directorio $WORKDIR..."
    mkdir -p $WORKDIR
    echo "Copia tu código a $WORKDIR o clona el repo git."
    echo "Alternativa: desde Windows, copia la carpeta a \\wsl$\Ubuntu-22.04\home\\$USER\\ppg-erp"
fi

cd $WORKDIR

# 7. Instalar dependencias del proyecto
if [ -f "package.json" ]; then
    echo "[7/7] Instalando dependencias del proyecto..."
    pnpm install
    echo "=========================================="
    echo "Setup completo!"
    echo "=========================================="
else
    echo "No se encontró package.json. Copia el proyecto a $WORKDIR primero."
fi

echo ""
echo "=== PARA INICIAR EL PROYECTO ==="
echo ""
echo "1. Asegúrate que Docker Desktop está corriendo en Windows"
echo ""
echo "2. En WSL2, ve al directorio del proyecto:"
echo "   cd ~/ppg-erp"
echo ""
echo "3. Crea el archivo .env:"
echo "   cp .env.example .env"
echo "   # Edita DATABASE_URL si es necesario"
echo ""
echo "4. Inicia los servidores:"
echo "   pnpm dev"
echo ""
echo "5. Abre http://localhost:3000 en tu navegador"
echo ""
echo "=== COMANDOS ÚTILES ==="
echo "  pnpm dev          - Iniciar desarrollo (API + Web)"
echo "  pnpm --filter @ppg/api dev    - Solo API"
echo "  pnpm --filter @ppg/web dev    - Solo Web"
echo "  pnpm build        - Build para producción"
echo "  docker ps         - Ver contenedores Docker"
