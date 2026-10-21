# BlueSentinel Multi-Service Launcher (PowerShell)
param(
    [switch]$Split
)

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if ($Split) {
    Write-Host "Starting Ocean Depth Microservice on http://localhost:8001 in separate window..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$RootDir\ocean_depth_service`"; .\.venv\Scripts\Activate.ps1; python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload"

    Write-Host "Starting Main Backend on http://localhost:8000 in separate window..." -ForegroundColor Green
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$RootDir\backend`"; .\venv\Scripts\Activate.ps1; python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

    Write-Host "Both services launched in separate windows!" -ForegroundColor Yellow
} else {
    $python = if (Test-Path "$RootDir\backend\venv\Scripts\python.exe") { "$RootDir\backend\venv\Scripts\python.exe" } else { "python" }
    & $python "$RootDir\start_services.py"
}
