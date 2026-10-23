#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'
if [ ! -f .env ]; then
  cp .env.example .env
  .venv/bin/python -c 'from pathlib import Path; import secrets; p=Path(".env"); p.write_text(p.read_text().replace("MIU_API_TOKEN=", "MIU_API_TOKEN="+secrets.token_urlsafe(32)))'
  chmod 600 .env
fi
.venv/bin/python -m pytest -q
