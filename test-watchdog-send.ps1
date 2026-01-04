$config = Get-Content 'C:\git\spunk\watchdog-config.json' | ConvertFrom-Json
$apiKey = $config.apiKey
Write-Host "API Key: $($apiKey.Substring(0,20))..."

$log = @{
    timestamp = (Get-Date).ToString('o')
    message = 'Watchdog test log'
    source = 'lognog-watchdog'
    event_type = 'TEST'
}

$body = @($log) | ConvertTo-Json -Depth 5
Write-Host "Body: $body"

$headers = @{
    'Content-Type' = 'application/json'
    'X-API-Key' = $apiKey
    'X-App-Name' = 'lognog-watchdog'
}

try {
    $result = Invoke-RestMethod -Uri 'http://localhost:4000/ingest/http' -Method Post -Body $body -Headers $headers -TimeoutSec 5 -ErrorAction Stop
    Write-Host "SUCCESS: $result"
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    Write-Host "Details: $($_.ErrorDetails.Message)"
}
