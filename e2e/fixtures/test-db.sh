#!/usr/bin/env bash
#
# Ephemeral Postgres for e2e tests.
#
# Spins up a disposable postgres:16 container on port 5433 (5433 avoids
# clashing with any local Postgres on 5432), applies the Drizzle schema, and
# tears it down. When Docker is down it falls back to a throwaway Homebrew
# postgresql@15 cluster on the same port; TEST_DB_BACKEND=docker|brew forces one. This DB is throwaway — e2e truncates it freely. It is NEVER
# the Neon `main` (prod) or `development` branch.
#
# Usage:
#   e2e/fixtures/test-db.sh up      # start container + apply schema
#   e2e/fixtures/test-db.sh down    # stop + remove container
#   e2e/fixtures/test-db.sh reset   # down then up (clean slate)
#   e2e/fixtures/test-db.sh running # exit 0 when the test DB is up
#
# DATABASE_URL for the test DB:
#   postgresql://postgres:test@localhost:5433/app_test
#
set -euo pipefail

CONTAINER="pi-e2e-db"
PORT="5433"
DB="app_test"
export DATABASE_URL_TEST="postgresql://postgres:test@localhost:${PORT}/${DB}"

# Docker when its daemon answers; otherwise a throwaway Homebrew postgresql@15 cluster on the same
# port, user and password (memory db-e2e-without-docker). TEST_DB_BACKEND forces one.
BACKEND="${TEST_DB_BACKEND:-$(docker info >/dev/null 2>&1 && echo docker || echo brew)}"
PGDATA_DIR="${TMPDIR:-/tmp}/adored-test-pg"

docker_up() {
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
}

docker_down() {
  # ps -a so a stopped leftover is also cleaned up.
  if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "test-db: removing ${CONTAINER}…"
    docker rm -f "${CONTAINER}" >/dev/null
    echo "test-db: removed"
  else
    echo "test-db: ${CONTAINER} not present"
  fi
}

brew_bin() {
  local bin
  bin="$(brew --prefix postgresql@15 2>/dev/null)/bin"
  if [ ! -x "${bin}/pg_ctl" ]; then
    echo "test-db: Docker is not running and Homebrew postgresql@15 is missing — start Docker or 'brew install postgresql@15'" >&2
    exit 1
  fi
  echo "${bin}"
}

brew_up() {
  local bin; bin="$(brew_bin)"
  if ! "${bin}/pg_ctl" -D "${PGDATA_DIR}" status >/dev/null 2>&1; then
    echo "test-db: Docker unavailable — starting Homebrew postgresql@15 on 127.0.0.1:${PORT}…"
    [ -f "${PGDATA_DIR}/PG_VERSION" ] || "${bin}/initdb" -D "${PGDATA_DIR}" -U postgres --auth=trust >/dev/null
    # Loopback only, like the container (guessable credentials).
    "${bin}/pg_ctl" -D "${PGDATA_DIR}" -l "${PGDATA_DIR}/server.log" -w \
      -o "-p ${PORT} -k ${PGDATA_DIR} -c listen_addresses=127.0.0.1,::1" start >/dev/null
    "${bin}/createdb" -h 127.0.0.1 -p "${PORT}" -U postgres "${DB}"
  fi
}

brew_down() {
  local bin; bin="$(brew --prefix postgresql@15 2>/dev/null)/bin"
  if [ -x "${bin}/pg_ctl" ] && "${bin}/pg_ctl" -D "${PGDATA_DIR}" status >/dev/null 2>&1; then
    "${bin}/pg_ctl" -D "${PGDATA_DIR}" -m fast stop >/dev/null
  fi
  rm -rf "${PGDATA_DIR}" # like docker rm: down means the data is gone, so reset is a clean slate
  echo "test-db: Homebrew cluster removed"
}

running() {
  if [ "${BACKEND}" = docker ]; then
    docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"
  else
    "$(brew --prefix postgresql@15 2>/dev/null)/bin/pg_ctl" -D "${PGDATA_DIR}" status >/dev/null 2>&1
  fi
}

up() {
  "${BACKEND}_up"
  echo "test-db: applying schema (drizzle migrate)…"
  DATABASE_URL="${DATABASE_URL_TEST}" npm run db:migrate
  echo "test-db: up at ${DATABASE_URL_TEST}"
}
down() { "${BACKEND}_down"; }

case "${1:-}" in
  up)    up ;;
  down)  down ;;
  reset) down; up ;;
  running) running ;;
  *) echo "usage: $0 {up|down|reset|running}" >&2; exit 1 ;;
esac
