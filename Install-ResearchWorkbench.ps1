$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Local-Environment.ps1')
Push-Location $DeerRoot
try {
    # Editable development install; the upstream uv lock remains unchanged.
    & $DeerPython -m pip --python backend/.venv/Scripts/python.exe install --no-deps -e examples/deerflow-extension-research-workbench --index-url https://pypi.tuna.tsinghua.edu.cn/simple --disable-pip-version-check
    if ($LASTEXITCODE -ne 0) { throw 'Research workbench installation failed.' }
    @'
import os
from pathlib import Path
import yaml
from deerflow.extensions.manager import _manager_lock, _write_plugins_block
path = Path(os.environ['DEER_FLOW_CONFIG_PATH'])
with _manager_lock(Path(os.environ['DEER_FLOW_PROJECT_ROOT'])):
    original = path.read_text(encoding='utf-8-sig')
    plugins = yaml.safe_load(original).get('plugins') or []
    entry = next((p for p in plugins if p.get('use') == 'deerflow_extension_research:install'), None)
    if entry is None:
        entry = {'name': 'research-workbench', 'use': 'deerflow_extension_research:install', 'enabled': True, 'required': True, 'config': {'enabled': True}}
        plugins.append(entry)
    entry['enabled'] = True
    entry.setdefault('config', {})['enabled'] = True
    _write_plugins_block(path, original, plugins)
print('Research workbench enabled. Restart DeerFlow to load it.')
'@ | & .\backend\.venv\Scripts\python.exe -
    if ($LASTEXITCODE -ne 0) { throw 'Research workbench configuration failed.' }
} finally { Pop-Location }
