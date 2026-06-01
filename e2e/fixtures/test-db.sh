#!/usr/bin/env bash
#
# Ephemeral Postgres for e2e tests.
#
# Spins up a disposable postgres:16 container on port 5433 (5433 avoids
# clashing with any local Postgres on 5432), applies the Drizzle schema, and
# tears it down. This DB is throwaway — e2e truncates it freely. It is NEVER
# the Neon `main` (prod) or `development` branch.
#
# Usage:
#   e2e/fixtures/test-db.sh up      # start container + apply schema
#   e2e/fixtures/test-db.sh down    # stop + remove container
#   e2e/fixtures/test-db.sh reset   # down then up (clean slate)
#
# DATABASE_URL for the test DB:
#   postgresql://postgres:test@localhost:5433/purseinator_test
#
set -euo pipefail

CONTAINER="pi-e2e-db"
PORT="5433"
DB="purseinator_test"
export DATABASE_URL_TEST="postgresql://postgres:test@localhost:${PORT}/${DB}"

up() {
  # ps -a so a stopped leftover container (interrupted run) doesn't wedge us.
  if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
      echo "test-db: ${CONTAINER} already running"
    else
      echo "test-db: removing stopped ${CONTAINER}…"
      docker rm -f "${CONTAINER}" >/dev/null
    fi
  fi

  if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "test-db: starting ${CONTAINER} (postgres:16) on 127.0.0.1:${PORT}…"
    # Bind to loopback only — don't expose the test DB (guessable password) to
    # the LAN.
    docker run --rm -d \
      -p "127.0.0.1:${PORT}:5432" \
      -e POSTGRES_PASSWORD=test \
      -e POSTGRES_DB="${DB}" \
      --name "${CONTAINER}" \
      postgres:16 >/dev/null
  fi

  echo "test-db: waiting for readiness…"
  ready=""
  for _ in $(seq 1 30); do
    if docker exec "${CONTAINER}" pg_isready -U postgres -d "${DB}" >/dev/null 2>&1; then
      ready=1
      echo "test-db: ready"
      break
    fi
    sleep 1
  done
  if [ -z "${ready}" ]; then
    echo "test-db: ERROR — Postgres never became ready after 30s" >&2
    exit 1
  fi

  echo "test-db: applying schema (drizzle migrate)…"
  DATABASE_URL="${DATABASE_URL_TEST}" npm run db:migrate
  echo "test-db: up at ${DATABASE_URL_TEST}"
}

down() {
  # ps -a so a stopped leftover is also cleaned up.
  if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "test-db: removing ${CONTAINER}…"
    docker rm -f "${CONTAINER}" >/dev/null
    echo "test-db: removed"
  else
    echo "test-db: ${CONTAINER} not present"
  fi
}

case "${1:-}" in
  up)    up ;;
  down)  down ;;
  reset) down; up ;;
  *) echo "usage: $0 {up|down|reset}" >&2; exit 1 ;;
esac
