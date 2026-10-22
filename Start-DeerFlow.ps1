param([ValidateSet('Start', 'Stop', 'Status', 'Restart')][string]$Action = 'Start')
. (Join-Path $PSScriptRoot 'Local-Environment.ps1')
$StatePath = Join-Path $DeerRoot '.local\services.json'
$LogRoot = Join-Path $DeerRoot 'logs'

function Read-ServiceState {
    if (Test-Path -LiteralPath $StatePath) {
        return @(Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json)
    }
    return @()
}

function Get-OwnedProcess($record) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($record.pid)" -ErrorAction SilentlyContinue
    if ($proc -and [string]$proc.CreationDate.ToUniversalTime().Ticks -eq [string]$record.createdTicks) {
        return $proc
    }
    return $null
}

function Stop-LocalServices {
    foreach ($record in (Read-ServiceState)) {
        $owned = Get-OwnedProcess $record
        if ($owned) {
            if ($record.name -eq 'nginx') {
                & $DeerNginx -p ($DeerRoot.Replace('\', '/') + '/') -c docker/nginx/nginx.local.conf -s quit
                $master = Get-Process -Id $record.pid -ErrorAction SilentlyContinue
                if ($master) { $null = $master.WaitForExit(10000) }
            }
            Stop-OwnedTree $owned
            Write-Host "Stopped $($record.name)"
        }
    }
    if (Test-Path -LiteralPath $StatePath) { Remove-Item -LiteralPath $StatePath }
}

function Stop-OwnedTree($parent) {
    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $($parent.ProcessId)" |
        Where-Object { $_.CreationDate -ge $parent.CreationDate })
    $current = Get-CimInstance Win32_Process -Filter "ProcessId = $($parent.ProcessId)" -ErrorAction SilentlyContinue
    if ($current -and $current.CreationDate -eq $parent.CreationDate) {
        Stop-Process -Id $current.ProcessId -ErrorAction SilentlyContinue
    }
    foreach ($child in $children) { Stop-OwnedTree $child }
}

function Get-HttpStatus([string]$url) {
    try {
        return [int](Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 8).StatusCode
    } catch {
        if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
        return 0
    }
}

function Show-LocalStatus {
    foreach ($record in (Read-ServiceState)) {
        $running = [bool](Get-OwnedProcess $record)
        Write-Host "$($record.name): running=$running pid=$($record.pid)"
    }
    foreach ($url in @('http://localhost:8001/health', 'http://localhost:8001/health/ready', 'http://localhost:2026')) {
        Write-Host "$url -> HTTP $(Get-HttpStatus $url)"
    }
}

if ($Action -eq 'Stop') { Stop-LocalServices; exit }
if ($Action -eq 'Status') { Show-LocalStatus; exit }
if ($Action -eq 'Restart') { Stop-LocalServices }
if (@(Read-ServiceState | Where-Object { Get-OwnedProcess $_ }).Count -gt 0) {
    Show-LocalStatus
    Write-Host 'Use -Action Restart to reload configuration.'
    exit
}

foreach ($path in @($DeerNode, $DeerNginx, "$DeerRoot\backend\.venv\Scripts\python.exe", "$DeerRoot\frontend\node_modules\next\dist\bin\next")) {
    if (!(Test-Path -LiteralPath $path)) { throw "Missing dependency: $path" }
}
foreach ($port in @(8001, 3000, 2026)) {
    $probe = New-Object System.Net.Sockets.TcpClient
    try { $probe.Connect('127.0.0.1', $port); throw "Port $port is already in use." }
    catch [System.Net.Sockets.SocketException] { }
    finally { $probe.Dispose() }
}
New-Item -ItemType Directory -Force $LogRoot, (Split-Path $StatePath), $env:DEER_FLOW_HOME, "$DeerRoot\backend\sandbox", "$DeerRoot\temp" | Out-Null
$nginxPrefix = ($DeerRoot.Replace('\', '/') + '/')
& $DeerNginx -t -p $nginxPrefix -c docker/nginx/nginx.local.conf
if ($LASTEXITCODE -ne 0) { throw 'nginx configuration check failed.' }

$services = @(
    @{ name='gateway'; executable="$DeerRoot\backend\.venv\Scripts\python.exe"; arguments=@('-m','uvicorn','app.gateway.app:app','--host','127.0.0.1','--port','8001'); cwd="$DeerRoot\backend" },
    @{ name='frontend'; executable=$DeerNode; arguments=@('scripts/dev.mjs','--hostname','127.0.0.1','--port','3000'); cwd="$DeerRoot\frontend" },
    @{ name='nginx'; executable=$DeerNginx; arguments=@('-p',$nginxPrefix,'-c','docker/nginx/nginx.local.conf'); cwd=$DeerRoot }
)
$records = @()
try {
    foreach ($service in $services) {
        $proc = Start-Process -FilePath $service.executable -ArgumentList $service.arguments -WorkingDirectory $service.cwd -WindowStyle Hidden -PassThru -RedirectStandardOutput "$LogRoot\$($service.name).log" -RedirectStandardError "$LogRoot\$($service.name)-error.log"
        $native = Get-CimInstance Win32_Process -Filter "ProcessId = $($proc.Id)"
        if (!$native) { throw "$($service.name) exited during startup. See logs/." }
        $records += [pscustomobject]@{name=$service.name; pid=$proc.Id; createdTicks=[string]$native.CreationDate.ToUniversalTime().Ticks}
        ConvertTo-Json -InputObject @($records) | Set-Content -LiteralPath $StatePath -Encoding UTF8
        Write-Host "Started $($service.name) (PID $($proc.Id))"
    }
} catch { Stop-LocalServices; throw }
Write-Host 'DeerFlow: http://localhost:2026'
Write-Host 'Logs: logs/'
Write-Host 'Check readiness: .\Start-DeerFlow.ps1 -Action Status'
