$ErrorActionPreference = "Stop"

function Stop-ProcessById {
    param(
        [int]$Id,
        [string]$Label
    )

    if ($Id -le 0) {
        return $false
    }

    $process = Get-Process -Id $Id -ErrorAction SilentlyContinue
    if (-not $process) {
        return $false
    }

    Stop-Process -Id $Id -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped $Label (PID $Id)."
    return $true
}

function To-IntOrZero {
    param([object]$Value)

    if ($null -eq $Value) {
        return 0
    }

    $parsed = 0
    if ([int]::TryParse([string]$Value, [ref]$parsed)) {
        return $parsed
    }

    return 0
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$repoRootPath = $repoRoot.Path
$logDir = Join-Path $repoRootPath "storage\logs\preview"
$sessionPath = Join-Path $logDir "preview-session.json"

if (-not (Test-Path $sessionPath)) {
    Write-Host "No active preview session metadata found at $sessionPath"
    exit 0
}

$stoppedAny = $false

try {
    $session = Get-Content -Path $sessionPath -Raw | ConvertFrom-Json
    $tunnelPid = To-IntOrZero $(if ($session -and $session.tunnel) { $session.tunnel.pid } else { 0 })
    $frontendPid = To-IntOrZero $(if ($session -and $session.frontend) { $session.frontend.pid } else { 0 })
    $backendPid = To-IntOrZero $(if ($session -and $session.backend) { $session.backend.pid } else { 0 })

    $stoppedAny = (Stop-ProcessById -Id $tunnelPid -Label "tunnel") -or $stoppedAny
    $stoppedAny = (Stop-ProcessById -Id $frontendPid -Label "frontend") -or $stoppedAny
    $stoppedAny = (Stop-ProcessById -Id $backendPid -Label "backend") -or $stoppedAny
} catch {
    Write-Warning "Could not parse preview session metadata. Removing session file only."
}

Remove-Item -Path $sessionPath -Force -ErrorAction SilentlyContinue

if (-not $stoppedAny) {
    Write-Host "No running preview processes were found, but session metadata was cleared."
}
