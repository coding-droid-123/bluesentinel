@echo off
setlocal EnableDelayedExpansion

cd /d "%~dp0"

REM ── Create venv if it doesn't exist ──
if not exist "venv\Scripts\activate.bat" (
    echo Creating virtual environment...
    python -m venv venv
)

REM ── Activate venv ──
call venv\Scripts\activate.bat

REM ── Install requirements only when they change ──
set "MARKER=venv\.requirements_installed"
set NEEDS_INSTALL=0

if not exist "%MARKER%" (
    set NEEDS_INSTALL=1
) else (
    for %%A in (requirements.txt) do set "REQ_DATE=%%~tA"
    for %%A in (%MARKER%) do set "MARKER_DATE=%%~tA"
    if "!REQ_DATE!" gtr "!MARKER_DATE!" set NEEDS_INSTALL=1
)

if !NEEDS_INSTALL!==1 (
    echo Installing backend requirements...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo ERROR: Failed to install requirements.
        pause
        exit /b 1
    )
    echo. > "%MARKER%"
    echo Requirements installed successfully.
) else (
    echo Requirements already up to date, skipping install.
)

REM ── Start the server ──
echo.
echo ===================================
echo   BlueSentinel Backend
echo   http://localhost:8000
echo   Press Ctrl+C to stop
echo ===================================
echo.
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

endlocal
