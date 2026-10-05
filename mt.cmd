@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 goto missing_node
where npm >nul 2>&1
if errorlevel 1 goto missing_node
call npm ls --depth=0 >nul 2>&1
if errorlevel 1 (
  call npm ci
  if errorlevel 1 goto failed
)
call npm run build
if errorlevel 1 goto failed
node dist\apps\cli\main.js
if errorlevel 1 goto failed
pause
exit /b 0
:missing_node
echo Instale Node.js 20 ou superior, incluindo npm, e abra novamente.
:failed
pause
exit /b 1
