#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB_SCRIPT="${ROOT_DIR}/e2e/fixtures/test-db.sh"
STARTED_HERE=0

if ! bash "${DB_SCRIPT}" running; then
  STARTED_HERE=1
fi

cleanup() {
  local status=$?
  if [ "${STARTED_HERE}" -eq 1 ]; then
    bash "${DB_SCRIPT}" down
  fi
  exit "${status}"
}

trap cleanup EXIT INT TERM

bash "${DB_SCRIPT}" up

cd "${ROOT_DIR}"
# Run EVERY DB test file under src/lib/db so new DB tests are auto-included.
# --no-file-parallelism keeps the files serial: concurrent RUN_DB_TESTS files
# deadlock on the shared DB (memory: db-test-parallel-deadlock).
RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db "$@"
