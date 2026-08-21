# ForgeAPI Auto-Watchdog - keeps tunnel + servers alive 24/7
# Path: C:\Users\Win11\.gemini\antigravity-ide\scratch\sol-bridge-gateway\watchdog.ps1

$ProjectDir = "C:\Users\Win11\.gemini\antigravity-ide\scratch\sol-bridge-gateway"
$TunnelLogDir = "C:\Users\Win11\AppData\Local\Temp\opencode"
$TunnelLog = "$TunnelLogDir\watchdog_tunnel.log"
$VercelCmd = "C:\Users\Win11\AppData\Roaming\npm\vercel.cmd"
$CurrentTunnelHost = ""
$LastDeployTime = 0

function Log($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Add-Content -Path "$TunnelLogDir\watchdog.log" -Value $line -ErrorAction SilentlyContinue
    Write-Host $line
}

function Get-TunnelHost {
    $out = "$TunnelLogDir\tunnel_live.txt"
    $hostMatch = Select-String -Path $out -Pattern "https://([a-z0-9\-]+\.trycloudflare\.com)" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hostMatch) {
        $m = [regex]::Match($hostMatch.Line, "https://([a-z0-9\-]+\.trycloudflare\.com)")
        if ($m.Success) { return $m.Groups[1].Value }
    }
    $errMatch = Select-String -Path "$out.err" -Pattern "https://([a-z0-9\-]+\.trycloudflare\.com)" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($errMatch) {
        $m = [regex]::Match($errMatch.Line, "https://([a-z0-9\-]+\.trycloudflare\.com)")
        if ($m.Success) { return $m.Groups[1].Value }
    }
    return ""
}

function Start-Tunnel {
    $out = "$TunnelLogDir\tunnel_live.txt"
    Remove-Item $out -Force -ErrorAction SilentlyContinue
    Remove-Item "$out.err" -Force -ErrorAction SilentlyContinue
    Start-Process cloudflared -ArgumentList "tunnel --url http://localhost:4567 --no-autoupdate" -RedirectStandardOutput $out -RedirectStandardError "$out.err" -WindowStyle Hidden
    Log "cloudflared started"
    Start-Sleep 14
    return (Get-TunnelHost)
}

function Update-TunnelHostInCode($hostname) {
    $epFile = "$ProjectDir\relay_endpoint.json"
    $cfg = @{ host = $hostname; protocol = "https"; port = 443 }
    $cfg | ConvertTo-Json | Set-Content -Path $epFile -NoNewline
    Log "Updated relay_endpoint.json -> $hostname"
    return $true
}

function Restart-Servers {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match "server.js|relay-server.js" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    Start-Sleep 2
    Start-Process node -ArgumentList "server.js" -WorkingDirectory $ProjectDir -WindowStyle Hidden
    Start-Process node -ArgumentList "relay-server.js" -WorkingDirectory $ProjectDir -WindowStyle Hidden
    Start-Sleep 3
    Log "node servers restarted"
}

function Redploy-Vercel {
    Set-Location $ProjectDir
    $out = & $VercelCmd --prod --yes 2>&1 | Out-String
    Log "Vercel redeploy done (url changed)"
}

function Test-TunnelHealth($hostname) {
    if (-not $hostname) { return $false }
    for ($attempt = 1; $attempt -le 4; $attempt++) {
        try {
            $r = Invoke-WebRequest -Uri "https://$hostname/relay/health" -Method POST -Headers @{"x-relay-secret"="apiforge-relay-secret-2026"} -UseBasicParsing -TimeoutSec 20
            if ($r.StatusCode -eq 200) {
                Log "Tunnel health OK ($hostname)"
                return $true
            }
        } catch { }
        Log "Tunnel health attempt $attempt failed - retrying in 10s..."
        Start-Sleep 10
    }
    return $false
}

# Main loop
Log "=== ForgeAPI Watchdog started ==="

# Start servers if not running
$serversUp = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match "server.js|relay-server.js" }
if (-not $serversUp) {
    Restart-Servers
}

while ($true) {
    try {
        # 1. Ensure node servers running
        $serversUp = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match "server.js|relay-server.js" }
        if (-not $serversUp) {
            Log "Servers down - restarting"
            Restart-Servers
        }

        # 2. Ensure cloudflared running
        $tun = Get-Process cloudflared -ErrorAction SilentlyContinue
        if (-not $tun) {
            Log "cloudflared down - restarting tunnel"
            $newHost = Start-Tunnel
            if ($newHost) {
                Log "New tunnel host: $newHost"
                if ($CurrentTunnelHost -ne $newHost) {
                    $healthy = Test-TunnelHealth $newHost
                    if ($healthy) {
                        $changed = Update-TunnelHostInCode $newHost
                        if ($changed) {
                            Restart-Servers
                            Redploy-Vercel
                        }
                        $CurrentTunnelHost = $newHost
                    } else {
                        Log "Tunnel $newHost unhealthy after retries - restarting"
                        Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
                    }
                }
            } else {
                Log "WARNING: could not get tunnel URL"
            }
        } else {
            # cloudflared running - extract current host to compare
            $url = Get-TunnelHost
            if ($url -and $CurrentTunnelHost -eq "") {
                $CurrentTunnelHost = $url
                Log "Tunnel host detected: $CurrentTunnelHost"
            }
        }

        # 3. Verify tunnel actually reachable (only if we know the host)
        if ($CurrentTunnelHost) {
            try {
                $r = Invoke-WebRequest -Uri "https://$CurrentTunnelHost/relay/health" -Method POST -Headers @{"x-relay-secret"="apiforge-relay-secret-2026"} -UseBasicParsing -TimeoutSec 15
                if ($r.StatusCode -ne 200) {
                    Log "Tunnel health non-200 ($($r.StatusCode)) - restarting"
                    Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
                }
            } catch {
                # allow up to 2 consecutive failures before restarting
                $Script:healthFails = ($Script:healthFails + 1)
                if ($Script:healthFails -ge 2) {
                    Log "Tunnel health FAILED x2 - restarting cloudflared"
                    Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
                    $Script:healthFails = 0
                    $CurrentTunnelHost = ""
                }
            }
        }
    } catch {
        Log "Watchdog error: $($_.Exception.Message)"
    }

    Start-Sleep 45
}