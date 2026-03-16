$ErrorActionPreference = "Stop"

param(
    [switch]$NoOpenBrowser
)

$stopScript = Join-Path $PSScriptRoot "stop-cloudflare-preview.ps1"
$startScript = Join-Path $PSScriptRoot "start-cloudflare-preview.ps1"

if (-not (Test-Path $stopScript)) {
    throw "Missing stop script: $stopScript"
}

if (-not (Test-Path $startScript)) {
    throw "Missing start script: $startScript"
}

Write-Host "Stopping current preview (if running)..."
& $stopScript
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Stop step returned exit code $LASTEXITCODE. Continuing with restart."
}

Start-Sleep -Seconds 1

Write-Host "Starting preview..."
if ($NoOpenBrowser) {
    & $startScript -NoOpenBrowser
} else {
    & $startScript
}
exit $LASTEXITCODE
