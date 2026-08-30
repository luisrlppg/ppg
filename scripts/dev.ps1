param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("up", "stop", "status", "logs")]
  [string]$Action
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envMap = @{}

if (Test-Path (Join-Path $root ".env")) {
  Get-Content (Join-Path $root ".env") | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z0-9_]+)\s*=\s*(.+?)\s*$') {
      $envMap[$matches[1]] = $matches[2].Trim('"', "'")
    }
  }
}

function Get-EnvOr([string]$key, [string]$fallback) {
  if ($envMap.ContainsKey($key) -and $envMap[$key]) { return $envMap[$key] }
  return $fallback
}

$DATABASE_URL = Get-EnvOr "DATABASE_URL" "postgresql://ppg:ppg@localhost:5433/ppg?schema=public"
$JWT_SECRET = Get-EnvOr "JWT_SECRET" "dev-secret-change-me"
$COOKIE_NAME = Get-EnvOr "COOKIE_NAME" "ppg_session"
$apiPort = Get-EnvOr "API_PORT" "3001"
$webPort = Get-EnvOr "WEB_PORT" "3000"

function Get-PidOnPort([int]$port) {
  $line = netstat -ano | Select-String "LISTENING" | Select-String ":$port\s" | Select-Object -First 1
  if ($line) {
    $pidText = ($line.ToString() -split '\s+')[-1]
    if ($pidText -match '^\d+$') { return [int]$pidText }
  }
  return $null
}

function Start-Detached([string]$commandLine) {
  Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $commandLine } |
    Out-Null
}

function Invoke-Up {
  Write-Host "==> PostgreSQL"
  Push-Location $root
  docker compose up -d postgres
  Pop-Location

  $apiDir = Join-Path $root "apps\api"
  $webDir = Join-Path $root "apps\web"

  $apiOn = Get-PidOnPort ([int]$apiPort)
  if ($apiOn) {
    Write-Host "API ya corriendo en :$apiPort (pid $apiOn)."
  } else {
    Write-Host "==> API en :$apiPort"
    $apiCmd = "cmd.exe /d /c set `"DATABASE_URL=$DATABASE_URL`"&&set `"JWT_SECRET=$JWT_SECRET`"&&set `"COOKIE_NAME=$COOKIE_NAME`"&&set `"API_PORT=$apiPort`"&&cd /d `"$apiDir`"&&node dist\main.js>`"$root\api.log`" 2>&1"
    if (-not (Test-Path (Join-Path $apiDir "dist\main.js"))) {
      throw "Falta dist/main.js. Compila primero: pnpm --filter @ppg/api build"
    }
    Start-Detached $apiCmd
  }

  $webOn = Get-PidOnPort ([int]$webPort)
  if ($webOn) {
    Write-Host "Web ya corriendo en :$webPort (pid $webOn)."
  } else {
    Write-Host "==> Web en :$webPort"
    $webCmd = "cmd.exe /d /c cd /d `"$webDir`"&&node node_modules\next\dist\bin\next dev -p $webPort>`"$root\web.log`" 2>&1"
    Start-Detached $webCmd
  }
}

function Invoke-Stop {
  foreach ($port in @([int]$webPort, [int]$apiPort)) {
    $pidOn = Get-PidOnPort $port
    if ($pidOn) {
      Stop-Process -Id $pidOn -Force -ErrorAction SilentlyContinue
      Write-Host "Detenido proceso en :$port (pid $pidOn)."
    }
  }
}

function Invoke-Status {
  foreach ($port in @([int]$webPort, [int]$apiPort)) {
    $pidOn = Get-PidOnPort $port
    if ($pidOn) { Write-Host ":${port} -> OK (pid $pidOn)" } else { Write-Host ":${port} -> detenido" }
  }
}

function Invoke-Logs {
  Write-Host "=== web.log (ultimas 15) ==="
  Get-Content (Join-Path $root "web.log") -ErrorAction SilentlyContinue | Select-Object -Last 15
  Write-Host ""
  Write-Host "=== api.log (ultimas 15) ==="
  Get-Content (Join-Path $root "api.log") -ErrorAction SilentlyContinue | Select-Object -Last 15
  Write-Host ""
  Write-Host "=== api.err.log ==="
  Get-Content (Join-Path $root "api.err.log") -ErrorAction SilentlyContinue | Select-Object -Last 15
}

switch ($Action) {
  "up" { Invoke-Up }
  "stop" { Invoke-Stop }
  "status" { Invoke-Status }
  "logs" { Invoke-Logs }
}