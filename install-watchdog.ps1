# Install LogNog Watchdog Scheduled Task
# Run as Administrator: powershell -ExecutionPolicy Bypass -File install-watchdog.ps1

$taskName = "LogNog Watchdog"
$scriptPath = "C:\git\spunk\watchdog.ps1"

Write-Host "Installing LogNog Watchdog scheduled task..." -ForegroundColor Cyan

# Remove existing task if present
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

# Create action
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""

# Create trigger - every 15 minutes, repeat for 10 years
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 3650)

# Settings
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable -MultipleInstances IgnoreNew

# Register task (without elevated privileges - Docker Desktop runs as current user)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Monitors logs.machinekinglabs.com and auto-recovers Docker if down"

# Start it immediately
Start-ScheduledTask -TaskName $taskName

Write-Host ""
Write-Host "SUCCESS! Watchdog installed." -ForegroundColor Green
Write-Host ""
Write-Host "Task: $taskName" -ForegroundColor Yellow
Write-Host "Runs: Every 15 minutes" -ForegroundColor Yellow
Write-Host "Log:  C:\git\spunk\watchdog.log" -ForegroundColor Yellow
Write-Host ""
Write-Host "To uninstall: Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false" -ForegroundColor Gray
