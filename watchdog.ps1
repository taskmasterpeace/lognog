# LogNog Watchdog v2 - Self-Monitoring Edition
# Sends logs TO LogNog so you can track uptime/downtime in the app itself

$configFile = "C:\git\spunk\watchdog-config.json"
$logFile = "C:\git\spunk\watchdog.log"
$stateFile = "C:\git\spunk\.watchdog-state.json"
$maxLogLines = 500

# Load config
$config = Get-Content $configFile | ConvertFrom-Json
$siteUrl = $config.siteUrl
$ingestUrl = $config.ingestUrl
$apiKey = $config.apiKey

function Write-Log {
    param($Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "$timestamp - $Message"
    Add-Content -Path $logFile -Value $logEntry

    # Trim log file
    $lines = Get-Content $logFile -ErrorAction SilentlyContinue
    if ($lines.Count -gt $maxLogLines) {
        $lines | Select-Object -Last $maxLogLines | Set-Content $logFile
    }
}

function Get-State {
    if (Test-Path $stateFile) {
        return Get-Content $stateFile | ConvertFrom-Json
    }
    return @{
        last_up = $null
        last_down = $null
        uptime_start = (Get-Date).ToString("o")
        consecutive_failures = 0
        total_recoveries = 0
    }
}

function Save-State {
    param($State)
    $State | ConvertTo-Json | Set-Content $stateFile
}

function Send-ToLogNog {
    param($EventType, $Message, $Metadata = @{})

    $log = @{
        timestamp = (Get-Date).ToString("o")
        source = "lognog-watchdog"
        host = $env:COMPUTERNAME
        severity = if ($EventType -like "*DOWN*" -or $EventType -like "*ERROR*") { "error" } elseif ($EventType -like "*RECOVERY*") { "warning" } else { "info" }
        app_name = "watchdog"
        message = $Message
        event_type = $EventType
    }

    # Add metadata
    foreach ($key in $Metadata.Keys) {
        $log[$key] = $Metadata[$key]
    }

    try {
        # Manually construct JSON array to ensure proper format
        $logJson = $log | ConvertTo-Json -Depth 5 -Compress
        $body = "[$logJson]"
        $headers = @{
            "Content-Type" = "application/json"
            "X-API-Key" = $apiKey
            "X-App-Name" = "lognog-watchdog"
            "X-Index" = "watchdog"
        }
        Invoke-RestMethod -Uri $ingestUrl -Method Post -Body $body -Headers $headers -TimeoutSec 5 -ErrorAction Stop | Out-Null
        return $true
    } catch {
        # LogNog might be down or API key not configured
        return $false
    }
}

function Test-Site {
    try {
        $response = Invoke-WebRequest -Uri $siteUrl -Method Head -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Get-UptimeSeconds {
    param($State)
    if ($State.uptime_start) {
        $start = [DateTime]::Parse($State.uptime_start)
        return [int]((Get-Date) - $start).TotalSeconds
    }
    return 0
}

function Format-Duration {
    param($Seconds)
    $ts = [TimeSpan]::FromSeconds($Seconds)
    if ($ts.Days -gt 0) { return "$($ts.Days)d $($ts.Hours)h $($ts.Minutes)m" }
    if ($ts.Hours -gt 0) { return "$($ts.Hours)h $($ts.Minutes)m" }
    return "$($ts.Minutes)m $($ts.Seconds)s"
}

function Repair-Docker {
    Write-Log "RECOVERY: Starting Docker recovery..."

    Stop-Process -Name "Docker Desktop" -Force -ErrorAction SilentlyContinue
    Start-Sleep 2

    wsl --shutdown 2>$null
    Start-Sleep 3

    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    Write-Log "RECOVERY: Docker Desktop starting, waiting 45 seconds..."
    Start-Sleep 45

    Set-Location "C:\git\spunk"
    $output = docker-compose up -d 2>&1
    Write-Log "RECOVERY: docker-compose output: $output"

    Start-Sleep 5
    return (Test-Site)
}

# ========== MAIN ==========

$state = Get-State
$uptimeSeconds = Get-UptimeSeconds -State $state

if (Test-Site) {
    # Site is UP
    $state.consecutive_failures = 0
    $state.last_up = (Get-Date).ToString("o")

    # Send heartbeat every ~15 min (every run since task runs every 15 min)
    $uptimeFormatted = Format-Duration -Seconds $uptimeSeconds

    Send-ToLogNog -EventType "HEARTBEAT" -Message "LogNog is healthy. Uptime: $uptimeFormatted" -Metadata @{
        uptime_seconds = $uptimeSeconds
        uptime_formatted = $uptimeFormatted
        total_recoveries = $state.total_recoveries
        status = "healthy"
    }

    Write-Log "OK: Site healthy, uptime $uptimeFormatted"

} else {
    # Site is DOWN
    $state.consecutive_failures++
    $downtime_start = Get-Date

    Write-Log "DOWN: Site not responding (failure #$($state.consecutive_failures))"

    # Record downtime
    $state.last_down = $downtime_start.ToString("o")

    # Attempt recovery
    Write-Log "RECOVERY: Attempting auto-recovery..."
    $recovered = Repair-Docker

    $downtime_end = Get-Date
    $downtime_seconds = [int]($downtime_end - $downtime_start).TotalSeconds
    $downtime_formatted = Format-Duration -Seconds $downtime_seconds

    if ($recovered) {
        $state.total_recoveries++
        $state.uptime_start = (Get-Date).ToString("o")  # Reset uptime counter
        $state.consecutive_failures = 0

        Write-Log "RECOVERY: SUCCESS - Site is back up! Downtime was $downtime_formatted"

        # Send recovery log to LogNog (it's back up now)
        Start-Sleep 5  # Give it a moment to fully start
        Send-ToLogNog -EventType "RECOVERY_COMPLETE" -Message "LogNog recovered after $downtime_formatted downtime" -Metadata @{
            downtime_seconds = $downtime_seconds
            downtime_formatted = $downtime_formatted
            total_recoveries = $state.total_recoveries
            previous_uptime_seconds = $uptimeSeconds
            previous_uptime_formatted = (Format-Duration -Seconds $uptimeSeconds)
            status = "recovered"
        }
    } else {
        Write-Log "RECOVERY: FAILED - Site still down after recovery attempt"
        # Can't send to LogNog because it's still down
    }
}

Save-State -State $state
