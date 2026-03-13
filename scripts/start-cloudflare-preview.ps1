param(
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173,
    [string]$BackendHost = "127.0.0.1",
    [string]$FrontendHost = "127.0.0.1",
    [switch]$NoOpenBrowser
)

$ErrorActionPreference = "Stop"

function Resolve-ExecutablePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommandName,
        [string[]]$FallbackPaths = @()
    )

    $command = Get-Command $CommandName -ErrorAction SilentlyContinue
    if ($command -and $command.Source) {
        return $command.Source
    }

    foreach ($path in $FallbackPaths) {
        if ($path -and (Test-Path $path)) {
            return $path
        }
    }

    return $null
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

function Stop-ProcessById {
    param(
        [int]$Id,
        [string]$Label
    )

    if ($Id -le 0) {
        return
    }

    $process = Get-Process -Id $Id -ErrorAction SilentlyContinue
    if (-not $process) {
        return
    }

    Stop-Process -Id $Id -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped $Label (PID $Id)."
}

function Wait-ForTcpPort {
    param(
        [string]$Host,
        [int]$Port,
        [int]$TimeoutSeconds = 60
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $client = [System.Net.Sockets.TcpClient]::new()
            $async = $client.BeginConnect($Host, $Port, $null, $null)
            $connected = $async.AsyncWaitHandle.WaitOne(250)

            if ($connected -and $client.Connected) {
                $client.EndConnect($async) | Out-Null
                $client.Close()
                return $true
            }

            $client.Close()
        } catch {
            # Ignore and retry until timeout.
        }

        Start-Sleep -Milliseconds 250
    }

    return $false
}

function Extract-TunnelUrl {
    param(
        [string]$LogPath,
        [int]$TimeoutSeconds = 60
    )

    $pattern = "https://[-a-z0-9]+\.trycloudflare\.com"
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $deadline) {
        if (Test-Path $LogPath) {
            $content = Get-Content -Path $LogPath -Raw -ErrorAction SilentlyContinue
            if ($content -match $pattern) {
                return $Matches[0]
            }
        }

        Start-Sleep -Milliseconds 500
    }

    return $null
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$repoRootPath = $repoRoot.Path
$frontendPath = Join-Path $repoRootPath "frontend"
$logDir = Join-Path $repoRootPath "storage\logs\preview"
$sessionPath = Join-Path $logDir "preview-session.json"
$backendLog = Join-Path $logDir "backend.log"
$backendErrLog = Join-Path $logDir "backend.err.log"
$frontendLog = Join-Path $logDir "frontend.log"
$frontendErrLog = Join-Path $logDir "frontend.err.log"
$tunnelLog = Join-Path $logDir "tunnel.log"
$tunnelErrLog = Join-Path $logDir "tunnel.err.log"

if (-not (Test-Path $frontendPath)) {
    throw "Missing frontend directory at '$frontendPath'."
}

$cloudflaredPath = Resolve-ExecutablePath -CommandName "cloudflared" -FallbackPaths @(
    "C:\Program Files (x86)\cloudflared\cloudflared.exe",
    "C:\Program Files\cloudflared\cloudflared.exe"
)
if (-not $cloudflaredPath) {
    throw "cloudflared is not installed. Install it with: winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements"
}

$phpPath = Resolve-ExecutablePath -CommandName "php"
if (-not $phpPath) {
    throw "PHP is not installed or not available in PATH."
}

$npmPath = Resolve-ExecutablePath -CommandName "npm"
if (-not $npmPath) {
    throw "npm is not installed or not available in PATH."
}

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

if (Test-Path $sessionPath) {
    try {
        $existing = Get-Content -Path $sessionPath -Raw | ConvertFrom-Json
        $existingBackendPid = To-IntOrZero $(if ($existing -and $existing.backend) { $existing.backend.pid } else { 0 })
        $existingFrontendPid = To-IntOrZero $(if ($existing -and $existing.frontend) { $existing.frontend.pid } else { 0 })
        $existingTunnelPid = To-IntOrZero $(if ($existing -and $existing.tunnel) { $existing.tunnel.pid } else { 0 })

        Stop-ProcessById -Id $existingBackendPid -Label "previous backend"
        Stop-ProcessById -Id $existingFrontendPid -Label "previous frontend"
        Stop-ProcessById -Id $existingTunnelPid -Label "previous tunnel"
    } catch {
        Write-Host "Found old preview session metadata but could not parse it. Continuing with fresh launch."
    }
}

foreach ($logPath in @($backendLog, $backendErrLog, $frontendLog, $frontendErrLog, $tunnelLog, $tunnelErrLog)) {
    if (Test-Path $logPath) {
        Remove-Item $logPath -Force -ErrorAction SilentlyContinue
    }
}

$escapedRepoRoot = $repoRootPath.Replace("'", "''")
$escapedFrontend = $frontendPath.Replace("'", "''")
$escapedCloudflared = $cloudflaredPath.Replace("'", "''")

$backendProcess = $null
$frontendProcess = $null
$tunnelProcess = $null

try {
    Write-Host "Starting backend on http://$BackendHost`:$BackendPort ..."
    $backendCommand = "Set-Location '$escapedRepoRoot'; php artisan serve --host=$BackendHost --port=$BackendPort"
    $backendProcess = Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $backendCommand) `
        -RedirectStandardOutput $backendLog `
        -RedirectStandardError $backendErrLog `
        -PassThru

    if (-not (Wait-ForTcpPort -Host $BackendHost -Port $BackendPort -TimeoutSeconds 60)) {
        throw "Backend did not start on port $BackendPort. Check $backendLog"
    }

    Write-Host "Starting frontend on http://$FrontendHost`:$FrontendPort ..."
    $frontendCommand = "Set-Location '$escapedFrontend'; `$env:VITE_API_BASE_URL='/'; `$env:VITE_DEV_BACKEND_URL='http://${BackendHost}:$BackendPort'; npm run dev -- --host $FrontendHost --port $FrontendPort"
    $frontendProcess = Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $frontendCommand) `
        -RedirectStandardOutput $frontendLog `
        -RedirectStandardError $frontendErrLog `
        -PassThru

    if (-not (Wait-ForTcpPort -Host $FrontendHost -Port $FrontendPort -TimeoutSeconds 90)) {
        throw "Frontend did not start on port $FrontendPort. Check $frontendLog"
    }

    Write-Host "Starting Cloudflare tunnel ..."
    $tunnelCommand = "& '$escapedCloudflared' tunnel --url http://${FrontendHost}:$FrontendPort --no-autoupdate"
    $tunnelProcess = Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $tunnelCommand) `
        -RedirectStandardOutput $tunnelLog `
        -RedirectStandardError $tunnelErrLog `
        -PassThru

    $publicUrl = Extract-TunnelUrl -LogPath $tunnelLog -TimeoutSeconds 60
    if (-not $publicUrl) {
        throw "Cloudflare tunnel started but no public URL was detected. Check $tunnelLog"
    }

    $session = [ordered]@{
        startedAt = (Get-Date).ToString("o")
        publicUrl = $publicUrl
        backend = @{
            pid = $backendProcess.Id
            host = $BackendHost
            port = $BackendPort
            log = $backendLog
            errLog = $backendErrLog
        }
        frontend = @{
            pid = $frontendProcess.Id
            host = $FrontendHost
            port = $FrontendPort
            log = $frontendLog
            errLog = $frontendErrLog
        }
        tunnel = @{
            pid = $tunnelProcess.Id
            log = $tunnelLog
            errLog = $tunnelErrLog
            executable = $cloudflaredPath
        }
    }
    $session | ConvertTo-Json -Depth 6 | Set-Content -Path $sessionPath -Encoding UTF8

    Write-Host ""
    Write-Host "Preview is live:"
    Write-Host "  $publicUrl"
    Write-Host ""
    Write-Host "Logs:"
    Write-Host "  Backend:  $backendLog"
    Write-Host "  Frontend: $frontendLog"
    Write-Host "  Tunnel:   $tunnelLog"
    Write-Host ""
    Write-Host "Stop preview:"
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\stop-cloudflare-preview.ps1"

    if (-not $NoOpenBrowser) {
        Start-Process $publicUrl | Out-Null
    }
} catch {
    Write-Error $_

    if ($tunnelProcess) {
        Stop-ProcessById -Id $tunnelProcess.Id -Label "tunnel"
    }
    if ($frontendProcess) {
        Stop-ProcessById -Id $frontendProcess.Id -Label "frontend"
    }
    if ($backendProcess) {
        Stop-ProcessById -Id $backendProcess.Id -Label "backend"
    }

    throw
}
