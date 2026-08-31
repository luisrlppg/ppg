@echo off
echo PPG ERP - Iniciando servidores...
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1"
echo.
echo Presiona cualquier tecla para salir...
pause >nul
