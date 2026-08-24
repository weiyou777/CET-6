@echo off
chcp 65001 >nul 2>&1
title CET6 Training System
cd /d "%~dp0"

echo ============================================
echo    CET6 Training System - Starting...
echo ============================================
echo.

REM === Find Node.js ===
where node >nul 2>&1
if %errorlevel%==0 (
    set "NODE_CMD=node"
    goto :found
)
if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2\node.exe" (
    set "NODE_CMD=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2\node.exe"
    goto :found
)
if exist "C:\Program Files\nodejs\node.exe" (
    set "NODE_CMD=C:\Program Files\nodejs\node.exe"
    goto :found
)

echo [ERROR] Node.js not found!
echo Please install Node.js from https://nodejs.org
echo Or double-click the HTML file directly (limited features).
pause
exit /b 1

:found
echo [1/2] Starting local server (port 8765)...
echo       Node: %NODE_CMD%

REM Open browser after 2 seconds
start "" cmd /c "timeout /t 2 /nobreak >nul & start "" http://localhost:8765/"

echo [2/2] Opening browser...
echo.
echo ============================================
echo   Server running! Browser should open now.
echo   URL: http://localhost:8765/
echo   Close this window to stop the server.
echo ============================================
echo.

REM Run server in foreground (closing window stops it)
"%NODE_CMD%" server.js

pause
