#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB_SCRIPT="${ROOT_DIR}/e2e/fixtures/test-db.sh"
CONTAINER="pi-e2e-db"
STARTED_HERE=0

if ! command -v docker >/dev/null 2>&1; then
  echo "test:db: docker is required to run the local e2e database" >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
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
RUN_DB_TESTS=1 npx vitest run src/lib/db/e2e-db.test.ts "$@"
