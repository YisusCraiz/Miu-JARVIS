$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
& '.venv/Scripts/python.exe' -m uvicorn miu.app:create_app --factory --host 127.0.0.1 --port 8000
exit $LASTEXITCODE
