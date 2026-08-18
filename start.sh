#!/usr/bin/env bash
# Single-process FinSight Investment Platform
cd "$(dirname "$0")"
export FINSIGHT_ROOT="$(pwd)"
PORT="${PORT:-8000}"
echo "Starting FinSight Investment Platform on port $PORT ..."
exec python -m uvicorn backend.main:app --host 0.0.0.0 --port "$PORT"
