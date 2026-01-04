# LogNog Docker Recovery Script
# Run this when Docker breaks: powershell -ExecutionPolicy Bypass -File fix-docker.ps1

Write-Host "Stopping Docker Desktop..." -ForegroundColor Yellow
Stop-Process -Name "Docker Desktop" -Force -ErrorAction SilentlyContinue

Write-Host "Shutting down WSL..." -ForegroundColor Yellow
wsl --shutdown

Write-Host "Waiting 3 seconds..." -ForegroundColor Yellow
Start-Sleep 3

Write-Host "Starting Docker Desktop..." -ForegroundColor Yellow
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"

Write-Host "Waiting 40 seconds for Docker to initialize..." -ForegroundColor Yellow
Start-Sleep 40

Write-Host "Starting LogNog containers..." -ForegroundColor Yellow
Set-Location "C:\git\spunk"
docker-compose up -d

Write-Host ""
Write-Host "Testing site..." -ForegroundColor Yellow
$response = Invoke-WebRequest -Uri "https://logs.machinekinglabs.com" -Method Head -TimeoutSec 10 -ErrorAction SilentlyContinue
if ($response.StatusCode -eq 200) {
    Write-Host "SUCCESS! Site is UP" -ForegroundColor Green
} else {
    Write-Host "Site may still be starting, check in a few seconds" -ForegroundColor Yellow
}
