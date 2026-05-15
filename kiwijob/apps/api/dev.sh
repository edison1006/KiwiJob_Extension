#!/usr/bin/env bash
# Run API from the correct directory so `import app` works.
cd "$(dirname "$0")"
exec .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
