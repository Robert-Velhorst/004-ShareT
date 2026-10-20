@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title ShareT - One-Click Setup
color 0A

:: ── SETTINGS ──────────────────────────────────────────────────
set PORT=5005
set "DOCKER_EXE=C:\Program Files\Docker\Docker\Docker Desktop.exe"
:: ──────────────────────────────────────────────────────────────

:: Windows / Notepad sometimes saves ".env.docker" as ".env.docker.txt".
:: Fix the name automatically so docker-compose finds the real file.
if not exist ".env.docker" if exist ".env.docker.txt" (
    echo  [..] Found .env.docker.txt - renaming to .env.docker
    ren ".env.docker.txt" ".env.docker"
)

:: Read PUBLIC_URL from .env.docker
set "PUBLIC_URL="
if exist .env.docker (
    for /f "tokens=1,* delims==" %%A in ('findstr /B "PUBLIC_URL=" .env.docker') do (
        set "PUBLIC_URL=%%B"
    )
)

cls
echo.
echo  ============================================================
echo    ShareT  --  One-Click Setup
echo  ============================================================
echo.

:: ════════════════════════════════════════════════
:: STEP 1  CHECK + START DOCKER
:: ════════════════════════════════════════════════
echo  [1/3] Checking Docker Desktop...

where docker >nul 2>&1
if !errorlevel! neq 0 (
    echo.
    echo  [!] Docker is not installed.
    echo      Opening download page...
    start "" https://www.docker.com/products/docker-desktop
    echo      Install Docker Desktop, restart your PC, then run this again.
    echo.
    pause
    exit /b
)
echo  [OK] Docker CLI found.

docker info >nul 2>&1
if !errorlevel! equ 0 goto docker_ok

echo  [..] Docker not running. Starting Docker Desktop...
if exist "%DOCKER_EXE%" (
    start "" "%DOCKER_EXE%"
) else (
    start "" "%LOCALAPPDATA%\Docker\Docker Desktop.exe"
)
echo  [..] Waiting up to 90s for Docker to start...
set _t=0

:waitdocker
timeout /t 3 /nobreak >nul
set /a _t+=3
docker info >nul 2>&1
if !errorlevel! equ 0 goto docker_ok
if !_t! lss 90 goto waitdocker

echo.
echo  [!] Docker did not start in time.
echo      Please open Docker Desktop manually, wait for it to load,
echo      then run this file again.
echo.
pause
exit /b

:docker_ok
echo  [OK] Docker is running.

:: ════════════════════════════════════════════════
:: STEP 2  CONFIRM LOCAL CONFIGURATION
:: ════════════════════════════════════════════════
echo.
echo  [2/3] Confirming the local Docker configuration.

:: ════════════════════════════════════════════════
:: STEP 3  START DOCKER STACK (App + Autoheal)
:: ════════════════════════════════════════════════
echo.
echo  [3/3] Building and starting ShareT stack in Docker...
echo        (App + Autoheal; no public tunnel)
echo.

docker compose up -d --build
if !errorlevel! neq 0 (
    echo.
    echo  [!] Docker compose failed. See errors above.
    echo.
    pause
    exit /b
)

echo.
echo  [..] Waiting for ShareT to be ready...
set _h=0

:waithealth
timeout /t 3 /nobreak >nul
set /a _h+=3
curl -sf http://127.0.0.1:%PORT%/ready >nul 2>&1
if !errorlevel! equ 0 goto health_ok
if !_h! lss 120 goto waithealth
echo  [WARN] Health check timed out - ShareT may still be starting.

:health_ok
echo  [OK] ShareT is running.

:: Open browser
start "" http://localhost:%PORT%

:: ════════════════════════════════════════════════
:: DONE
:: ════════════════════════════════════════════════
cls
echo.
echo  ============================================================
echo    ShareT is RUNNING (Managed by Docker)
echo  ============================================================
echo.
echo    Local URL:   http://localhost:%PORT%
if defined PUBLIC_URL (
    echo    Public URL:  !PUBLIC_URL!
    echo                 (Configure DNS and HTTPS on the production host)
) else (
    echo    Public URL:  Check your .env.docker PUBLIC_URL setting
)
echo.
echo  ============================================================
echo    Everything runs under Docker with auto-restart.
echo    To STOP:     docker compose down
echo    To RESTART:  run this file again
echo    Watchdog log: watchdog.log
echo  ============================================================
echo.
pause
