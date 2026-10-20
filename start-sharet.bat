@echo off
setlocal
title ShareT
cd /d "%~dp0"

if not exist "backend\node_modules" (
  echo Backend dependencies are missing. Run install.bat first.
  pause
  exit /b 1
)

if not exist "backend\frontend\dist\index.html" (
  echo Frontend build is missing. Run install.bat first.
  pause
  exit /b 1
)

call npm run doctor
if errorlevel 1 (
  echo.
  echo ShareT configuration is not ready. Fix the items above, then try again.
  pause
  exit /b 1
)

if not exist "backend\.env" (
  echo backend\.env is missing. Run install.bat and configure it first.
  pause
  exit /b 1
)

echo Starting ShareT at http://localhost:5005
echo Press Ctrl+C to stop the server.
start "" "http://localhost:5005"
pushd backend
node server.js
set EXIT_CODE=%errorlevel%
popd

if not "%EXIT_CODE%"=="0" (
  echo.
  echo ShareT stopped with exit code %EXIT_CODE%.
  pause
)
exit /b %EXIT_CODE%
