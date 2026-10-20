@echo off
:: ============================================================
::  ShareT - Watchdog (silent self-heal)
::  Runs on a schedule (see install-watchdog.bat). It NEVER shows
::  error dialogs and NEVER pauses. Every tick it makes sure:
::    1. Docker Desktop is running (starts it if not)
::    2. The ShareT stack is up   (docker compose up -d)
::    3. The app answers /ready   (logs the result)
::  Everything is appended to watchdog.log next to this file.
:: ============================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "LOG=%~dp0watchdog.log"
set "DOCKER_EXE=C:\Program Files\Docker\Docker\Docker Desktop.exe"
set PORT=5005

:: Keep unattended watchdog logging bounded. Preserve one previous log for
:: diagnosis and cap total retained text at roughly 10 MB.
if exist "%LOG%" for %%F in ("%LOG%") do if %%~zF GTR 5242880 (
    if exist "%LOG%.1" del /q "%LOG%.1"
    move /y "%LOG%" "%LOG%.1" >nul
)

call :log "tick ----------------------------------------"

:: ── 1) Docker engine reachable? ─────────────────────────────
docker info >nul 2>&1
if !errorlevel! equ 0 goto docker_ok

call :log "Docker not responding - launching Docker Desktop"
if exist "%DOCKER_EXE%" (
    start "" "%DOCKER_EXE%"
) else (
    start "" "%LOCALAPPDATA%\Docker\Docker Desktop.exe"
)

set _t=0
:waitdocker
timeout /t 5 /nobreak >nul
set /a _t+=5
docker info >nul 2>&1
if !errorlevel! equ 0 goto docker_ok
if !_t! lss 150 goto waitdocker
call :log "Docker still down after 150s - will retry next tick"
goto end

:docker_ok

:: ── 2) Make sure the stack is up (idempotent) ───────────────
::    Starts only what is stopped; no rebuild, no-op if all healthy.
set "NGROK_AUTHTOKEN="
set "NGROK_DOMAIN="
if exist .env.docker (
    for /f "tokens=1,* delims==" %%A in ('findstr /B "NGROK_AUTHTOKEN= NGROK_DOMAIN=" .env.docker') do set "%%A=%%B"
)
docker compose up -d >>"%LOG%" 2>&1

:: ── 3) Is the app actually answering? ───────────────────────
curl -sf http://127.0.0.1:%PORT%/ready >nul 2>&1
if !errorlevel! equ 0 (
    call :log "OK - app healthy"
) else (
    call :log "App not answering yet - compose up issued, recheck next tick"
)

:end
endlocal
exit /b

:log
echo [%date% %time%] %~1>>"%LOG%"
exit /b
