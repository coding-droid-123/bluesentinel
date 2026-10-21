@echo off
setlocal
cd /d "%~dp0"

echo ================================================================
echo   BlueSentinel - Multi-Service Launcher
echo ================================================================
echo.
echo Choose execution mode (Auto-starting Mode 1 in 3s...):
echo   [1] Unified Terminal  (Combined colorized logs in this window)
echo   [2] Split Windows     (Launch each service in its own terminal)
echo.

choice /c 12 /t 3 /d 1 /m "Select mode [1 or 2]: "
if errorlevel 2 goto split_mode

:unified_mode
if exist "backend\venv\Scripts\python.exe" (
    backend\venv\Scripts\python.exe start_services.py
) else (
    python start_services.py
)
goto end

:split_mode
echo.
echo Starting Ocean Depth Microservice on http://localhost:8001 ...
start "BlueSentinel Ocean Depth Service (Port 8001)" cmd /k "cd /d "%~dp0ocean_depth_service" && call .venv\Scripts\activate.bat && python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload"

echo Starting Main Backend on http://localhost:8000 ...
start "BlueSentinel Main Backend (Port 8000)" cmd /k "cd /d "%~dp0backend" && call venv\Scripts\activate.bat && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

echo.
echo Both services launched in separate windows!
:end
endlocal
