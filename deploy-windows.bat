@echo off
REM ShareT Windows Deployment Script
REM This script automates the deployment process

echo.
echo ========================================
echo   ShareT Windows Deployment
echo ========================================
echo.

REM Check if running as Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script must be run as Administrator!
    echo Right-click this file and select "Run as administrator"
    pause
    exit /b 1
)

echo [1/5] Checking prerequisites...
echo.

REM Check Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Node.js not found!
    echo Please install Node.js from: https://nodejs.org/
    pause
    exit /b 1
)
echo   - Node.js: OK

REM Check npm
where npm >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: npm not found!
    pause
    exit /b 1
)
echo   - npm: OK

echo.
echo [2/5] Installing dependencies...
call npm ci
if %errorLevel% neq 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)
pushd backend
call npm ci
if %errorLevel% neq 0 (
    popd
    echo ERROR: Failed to install backend dependencies
    pause
    exit /b 1
)
popd

echo.
echo [3/5] Building frontend...
call npm run build
if %errorLevel% neq 0 (
    echo ERROR: Failed to build frontend
    pause
    exit /b 1
)
call node scripts\copy-frontend-build.js
if %errorLevel% neq 0 (
    echo ERROR: Failed to copy frontend build
    pause
    exit /b 1
)

echo.
echo [4/5] Starting server with PM2...
call pm2 start ecosystem.config.js
if %errorLevel% neq 0 (
    echo ERROR: Failed to start server
    pause
    exit /b 1
)

echo.
echo [5/5] Saving PM2 configuration...
call pm2 save
if %errorLevel% neq 0 (
    echo WARNING: Failed to save PM2 configuration
)

echo.
echo ========================================
echo   Deployment Complete!
echo ========================================
echo.
echo ShareT is now running!
echo.
echo Local URL:  http://localhost:5005
echo.
echo Next steps:
echo 1. Prepare the production HTTPS origin on the Hetzner host
echo 2. Update .env files with your settings
echo 3. Check status: pm2 status
echo 4. View logs: pm2 logs sharet
echo.
pause
