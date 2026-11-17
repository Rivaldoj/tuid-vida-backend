@echo off
cd /d "%~dp0"
echo Esto ESCRIBE en la base de produccion (padron y fallecidos).
echo Ya sacaste el snapshot de master? Escribi SI para continuar.
set /p R=^> 
if /I not "%R%"=="SI" (echo Cancelado. & pause & exit /b)
node scripts\cargaMensual.js --apply --altas
pause
