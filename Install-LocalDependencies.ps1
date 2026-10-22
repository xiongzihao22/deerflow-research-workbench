param([string]$IndexUrl = 'https://pypi.tuna.tsinghua.edu.cn/simple')
. (Join-Path $PSScriptRoot 'Local-Environment.ps1')
Push-Location $DeerRoot
try {
    & uv venv --python $DeerPython --allow-existing backend/.venv
    if ($LASTEXITCODE -ne 0) { throw 'Virtual environment setup failed.' }
    & uv export --project backend --locked --format requirements-txt --no-emit-workspace --output-file .tools/requirements.lock.txt | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Lockfile export failed.' }
    # uv.lock includes the complete dependency closure and upstream uv overrides.
    & $DeerPython -m pip --python backend/.venv/Scripts/python.exe install --no-compile --no-deps --require-hashes -r .tools/requirements.lock.txt --find-links .tools/wheels --index-url $IndexUrl --timeout 30 --disable-pip-version-check
    if ($LASTEXITCODE -ne 0) { throw 'Locked dependency installation failed.' }
    & $DeerPython -m pip --python backend/.venv/Scripts/python.exe install --no-deps -e backend/packages/harness -e backend/packages/extension-api --index-url $IndexUrl --timeout 30 --disable-pip-version-check
    if ($LASTEXITCODE -ne 0) { throw 'Workspace package installation failed.' }
    & pnpm --dir frontend install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'Frontend installation failed.' }
} finally { Pop-Location }
