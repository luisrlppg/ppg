# PPG ERP - WSL2 Setup Script
# EJECUTAR COMO ADMINISTRADOR (clic derecho > Ejecutar como administrador)
# Solo ejecutar UNA VEZ

Write-Host "=== PPG ERP: WSL2 Setup ===" -ForegroundColor Cyan

# 1. Habilitar WSL2
Write-Host "`n[1/4] Habilitando WSL2..." -ForegroundColor Yellow
wsl --install --enable-feature --all-errors 2>$null
# Alternative method if above fails
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart 2>$null
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart 2>$null

# 2. Descargar e instalar Ubuntu 22.04
Write-Host "`n[2/4] Descargando Ubuntu 22.04 LTS..." -ForegroundColor Yellow
$wslPath = "$env:TEMP\ubuntu22.04.tar.gz"
$wslUrl = "https://cloud-images.ubuntu.com/wsl/jammy/current/ubuntu-jammy-wsl2.tar.gz"

try {
    Invoke-WebRequest -Uri $wslUrl -OutFile $wslPath -UseBasicParsing
    Write-Host "Ubuntu descargado. Importando..." -ForegroundColor Green
    wsl --import Ubuntu-22.04 "$env:USERPROFILE\Ubuntu22.04" $wslPath --quiet
    Remove-Item $wslPath -Force -ErrorAction SilentlyContinue
    Write-Host "Ubuntu importado." -ForegroundColor Green
} catch {
    Write-Host "Descarga falló. WSL --install automático se usará en su lugar." -ForegroundColor Yellow
    wsl --install -d Ubuntu --force-noninteractive 2>$null
}

# 3. Verificar que Ubuntu funciona
Write-Host "`n[3/4] Verificando Ubuntu..." -ForegroundColor Yellow
$ubuntuExists = wsl -l -v 2>$null | Select-String "Ubuntu-22.04"
if ($ubuntuExists) {
    Write-Host "Ubuntu 22.04 instalado." -ForegroundColor Green
} else {
    Write-Host "Revisa manualmente: wsl -l -v" -ForegroundColor Red
    Write-Host "Después ejecuta: wsl -d Ubuntu-22.04" -ForegroundColor Yellow
}

# 4. Instrucciones para primer inicio
Write-Host "`n[4/4] SIGUIENTE PASO:" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Ejecuta este comando EN UNA NUEVA TERMINAL:" -ForegroundColor White
Write-Host "  wsl -d Ubuntu-22.04" -ForegroundColor Green
Write-Host ""
Write-Host "Se te pedirá crear un usuario y contraseña." -ForegroundColor White
Write-Host "Después ejecuta DENTRO DE WSL:" -ForegroundColor White
Write-Host "  curl -sL https://raw.githubusercontent.com/anomalyco/ppg-erp/main/scripts/wsl2-dev-setup.sh | bash" -ForegroundColor Green
Write-Host ""
Write-Host "O copia manualmente el archivo scripts/wsl2-dev-setup.sh desde este repo." -ForegroundColor Yellow
Write-Host "======================================" -ForegroundColor Cyan
