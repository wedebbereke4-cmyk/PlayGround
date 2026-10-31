#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-3002}" /usr/bin/time -p node "${RUNTIME_DIR:?}/scripts/default-start.mjs"
