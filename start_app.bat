@echo off
title Maventee Inventory App
echo Starting Maventee Inventory App...
echo.

:: ── Get local IP for warehouse access ───────────────────────────────────────
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    set LOCAL_IP=%%a
    goto :found
)
:found
set LOCAL_IP=%LOCAL_IP: =%

:: ── Start FastAPI backend (0.0.0.0 = accessible on local network) ────────────
echo Starting backend...
cd /d "%~dp0backend"
start /B python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

timeout /t 3 /nobreak > nul

:: ── Start React frontend (0.0.0.0 = accessible on local network) ─────────────
echo Starting frontend...
cd /d "%~dp0frontend"
start /B npm run dev -- --host 0.0.0.0

timeout /t 4 /nobreak > nul

:: ── Open browser on this computer ────────────────────────────────────────────
start http://localhost:5173

echo.
echo ✅ App is running!
echo.
echo Office computer:    http://localhost:5173
echo Warehouse laptop:   http://%LOCAL_IP%:5173
echo.
echo Keep this window open. Close it to stop the app.
echo.
pause
