# PPG ERP - Dev Server Starter
# Ejecutar con: powershell -ExecutionPolicy Bypass -File start-dev.ps1

$ErrorActionPreference = "SilentlyContinue"

# 1. Ver estado actual
Write-Host "=== Estado actual de puertos ==="
Get-NetTCPConnection -LocalPort 3000,3001 -State Listen -ErrorAction SilentlyContinue | Format-Table

# 2. Matar procesos huerfanos en puertos 3000 y 3001
Write-Host "`n=== Matando procesos en puertos 3000 y 3001 ==="
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host "Killed PID $($_.OwningProcess) en puerto 3000" }
Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host "Killed PID $($_.OwningProcess) en puerto 3001" }
Start-Sleep -Seconds 2

# 3. Rebuild API
Write-Host "`n=== Haciendo build de API ==="
cmd /c "cd /d apps\api && node_modules\.bin\nest build" | Out-Null
if ($LASTEXITCODE -eq 0) { Write-Host "API build OK" } else { Write-Host "API build FALLO" }

# 4. Iniciar API
Write-Host "`n=== Iniciando API (puerto 3001) ==="
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "cmd"
$psi.Arguments = "/c node apps\api\dist\main.js"
$psi.WorkingDirectory = (Get-Location).Path
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
[System.Diagnostics.Process]::Start($psi) | Out-Null
Write-Host "API iniciada"
Start-Sleep -Seconds 4

# 5. Iniciar Web
Write-Host "`n=== Iniciando Web (puerto 3000) ==="
$psi2 = New-Object System.Diagnostics.ProcessStartInfo
$psi2.FileName = "cmd"
$psi2.Arguments = "/c cd /d apps\web && node_modules\.bin\next dev"
$psi2.WorkingDirectory = (Get-Location).Path
$psi2.UseShellExecute = $false
$psi2.CreateNoWindow = $true
[System.Diagnostics.Process]::Start($psi2) | Out-Null
Write-Host "Web iniciada"
Start-Sleep -Seconds 8

# 6. Verificar
Write-Host "`n=== Estado final ==="
Get-NetTCPConnection -LocalPort 3000,3001 -State Listen -ErrorAction SilentlyContinue | Format-Table

Write-Host "`nListo! Abre http://localhost:3000 en tu navegador."
Write-Host "Usuario: admin | Password: admin123"
