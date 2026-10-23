param([switch]$InstallPython, [switch]$InstallOllama, [switch]$Cloud, [string]$PythonExe)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Check-Exit([string]$Step) {
    if ($LASTEXITCODE -ne 0) { throw "$Step failed (exit $LASTEXITCODE)" }
}
if ($InstallPython) {
    winget install --id Python.Python.3.12 --exact --accept-source-agreements --accept-package-agreements
    Check-Exit 'Python installation'
}
if ($InstallOllama) {
    winget install --id Ollama.Ollama --exact --accept-source-agreements --accept-package-agreements
    Check-Exit 'Ollama installation'
}
if (-not (Test-Path '.venv/Scripts/python.exe')) {
    if ($PythonExe) { & $PythonExe -m venv .venv }
    else { py -3.12 -m venv .venv }
    Check-Exit 'Virtual environment creation (install Python 3.12 or pass -PythonExe)'
}
$python = Join-Path $PWD '.venv/Scripts/python.exe'
& $python -m pip install -e '.[dev]'
Check-Exit 'Dependencies'
if ($Cloud) {
    & $python -m pip install -e '.[cloud]'
    Check-Exit 'Optional cloud dependencies'
}
if (-not (Test-Path '.env')) {
    Copy-Item '.env.example' '.env'
    $token = & $python -c 'import secrets; print(secrets.token_urlsafe(32))'
    Check-Exit 'Token generation'
    $content = (Get-Content '.env' -Raw).Replace('MIU_API_TOKEN=', "MIU_API_TOKEN=$token")
    [IO.File]::WriteAllText((Join-Path $PWD '.env'), $content)
}
& $python -m pytest -q
Check-Exit 'Tests'
Write-Host 'Ready. Start Ollama, run: ollama pull qwen2.5:3b'
Write-Host 'Then run: powershell -ExecutionPolicy Bypass -File scripts/start.ps1'
