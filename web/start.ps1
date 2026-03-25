# Start Agentic Data Scientist Web UI
# Usage: .\web\start.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "`n  Agentic Data Scientist - Web UI" -ForegroundColor Cyan
Write-Host "  ================================`n" -ForegroundColor DarkCyan

# Start FastAPI backend
Write-Host "  Starting backend (port 8765)..." -ForegroundColor Yellow
$backend = Start-Process -PassThru -NoNewWindow -FilePath "uv" -ArgumentList "run python -m uvicorn web.backend.app:app --host 0.0.0.0 --port 8765" -WorkingDirectory $root

# Start Vite frontend
Write-Host "  Starting frontend (port 5173)..." -ForegroundColor Yellow
$VITE_FRONTEND = Start-Process -PassThru -NoNewWindow -FilePath "npm" -ArgumentList "run dev" -WorkingDirectory "$root\web\frontend"

Write-Host "`n  Open http://localhost:5173 in your browser`n" -ForegroundColor Green
Write-Host "  Press Ctrl+C to stop both servers`n" -ForegroundColor DarkGray

try {
    Wait-Process -Id $backend.Id
} finally {
    if (!$VITE_FRONTEND.HasExited) { Stop-Process -Id $VITE_FRONTEND.Id -Force }
    if (!$backend.HasExited) { Stop-Process -Id $backend.Id -Force }
}
