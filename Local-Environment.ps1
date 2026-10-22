$ErrorActionPreference = 'Stop'
$DeerRoot = $PSScriptRoot
$LocalRuntimeConfig = Join-Path $DeerRoot '.local\runtime.ps1'
if (Test-Path -LiteralPath $LocalRuntimeConfig) { . $LocalRuntimeConfig }
function Resolve-DeerTool([string]$Override, [string]$RelativePath, [string]$Command) {
    if ($Override) { return (Resolve-Path -LiteralPath $Override -ErrorAction Stop).Path }
    $portable = Join-Path $DeerRoot $RelativePath
    if (Test-Path -LiteralPath $portable) { return $portable }
    $installed = Get-Command $Command -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($installed) { return $installed.Source }
    throw "Install $Command or configure its DEERFLOW_* override in .local/runtime.ps1."
}
$DeerPython = Resolve-DeerTool $env:DEERFLOW_PYTHON '.tools\python\python.exe' 'python.exe'
$DeerNode = Resolve-DeerTool $env:DEERFLOW_NODE '.tools\node\node.exe' 'node.exe'
$DeerNginx = Resolve-DeerTool $env:DEERFLOW_NGINX '.tools\nginx-1.31.7\nginx.exe' 'nginx.exe'
$env:PATH = (@(
    (Join-Path $DeerRoot '.tools'),
    (Join-Path $DeerRoot '.tools\uv-package\bin'),
    (Join-Path $DeerRoot '.tools\git\cmd'),
    (Join-Path $DeerRoot '.tools\git\bin'),
    (Join-Path $DeerRoot '.tools\git\usr\bin'),
    (Join-Path $DeerRoot '.tools\nginx-1.31.7'),
    (Split-Path -Parent $DeerPython),
    (Split-Path -Parent $DeerNode),
    (Split-Path -Parent $DeerNginx),
    $env:PATH
) -join ';')
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$env:UV_PYTHON = $DeerPython
$env:UV_PYTHON_DOWNLOADS = 'never'
$env:UV_SYSTEM_CERTS = 'true'
$env:UV_HTTP_TIMEOUT = '180'
$env:UV_CONCURRENT_DOWNLOADS = '4'
$env:DEER_FLOW_PROJECT_ROOT = $DeerRoot
$env:DEER_FLOW_HOME = Join-Path $DeerRoot 'backend\.deer-flow'
$env:DEER_FLOW_CONFIG_PATH = Join-Path $DeerRoot 'config.yaml'
$env:DEER_FLOW_ENV_FILE = Join-Path $DeerRoot '.env'
$env:DEER_FLOW_DATE_TIMEZONE = 'Asia/Shanghai'
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:TIKTOKEN_CACHE_DIR = Join-Path $DeerRoot '.tools\tiktoken-cache'
$env:PORT = '3000'
