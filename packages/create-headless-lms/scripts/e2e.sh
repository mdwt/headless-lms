#!/usr/bin/env bash
# E2E: prove a scaffolded installation runs against a packed @headless-lms/server.
# Prereq: docker compose -f <repo>/docker/docker-compose.yml up -d  (Postgres on 8005)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
WORK="$(mktemp -d)"
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

if lsof -i :8000 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "ERROR: port 8000 is already in use — stop the stray process (e.g. a dev API) and re-run." >&2
  exit 1
fi

# @headless-lms/server ships as an unbundled transpile (dist mirrors src/
# file-for-file), so its @headless-lms/{types,utils,api-contract} imports stay
# real runtime dependencies, and @headless-lms/cli depends on it for the
# migrate/seed functions. `pnpm pack` rewrites their `workspace:*` ranges to
# the local version number (e.g. "0.0.0"), which isn't published to npm — a
# plain `pnpm install` in the standalone scaffold would try to fetch it from
# the registry and 404. So we pack all five workspace packages and pin the
# transitive ones via `pnpm.overrides` to their local tarballs, simulating
# what would otherwise be real npm-published versions.
echo "==> building workspace packages"
pnpm --filter @headless-lms/types --filter @headless-lms/utils --filter @headless-lms/api-contract --filter @headless-lms/server --filter @headless-lms/cli build

echo "==> packing @headless-lms/{types,utils,api-contract,server,cli}"
TYPES_TARBALL="$(cd "$ROOT/packages/types" && pnpm pack --pack-destination "$WORK" | tail -1)"
UTILS_TARBALL="$(cd "$ROOT/packages/utils" && pnpm pack --pack-destination "$WORK" | tail -1)"
CONTRACT_TARBALL="$(cd "$ROOT/packages/api-contract" && pnpm pack --pack-destination "$WORK" | tail -1)"
SERVER_TARBALL="$(cd "$ROOT/packages/server" && pnpm pack --pack-destination "$WORK" | tail -1)"
CLI_TARBALL="$(cd "$ROOT/packages/cli" && pnpm pack --pack-destination "$WORK" | tail -1)"

echo "==> scaffolding into $WORK"
pnpm --filter create-headless-lms build
(cd "$WORK" && node "$ROOT/packages/create-headless-lms/dist/index.js" e2e-lms --yes)

echo "==> installing with the packed server (transitive workspace deps pinned to local tarballs)"
(cd "$WORK/e2e-lms" && \
  npm pkg set "dependencies.@headless-lms/server=file:$SERVER_TARBALL" && \
  npm pkg set "dependencies.@headless-lms/cli=file:$CLI_TARBALL" && \
  npm pkg set "pnpm.overrides[@headless-lms/types]=file:$TYPES_TARBALL" && \
  npm pkg set "pnpm.overrides[@headless-lms/utils]=file:$UTILS_TARBALL" && \
  npm pkg set "pnpm.overrides[@headless-lms/api-contract]=file:$CONTRACT_TARBALL" && \
  npm pkg set "pnpm.overrides[@headless-lms/server]=file:$SERVER_TARBALL" && \
  pnpm install)

echo "==> migrate (docker Postgres on 8005 must be up; scaffold already set db name e2e_lms)"
docker compose -f "$ROOT/docker/docker-compose.yml" exec -T postgres \
  psql -U postgres -c 'DROP DATABASE IF EXISTS e2e_lms'
docker compose -f "$ROOT/docker/docker-compose.yml" exec -T postgres \
  psql -U postgres -c 'CREATE DATABASE e2e_lms'
(cd "$WORK/e2e-lms" && pnpm migrate)

echo "==> boot + probe"
(cd "$WORK/e2e-lms" && pnpm build)
(cd "$WORK/e2e-lms" && pnpm start > "$WORK/server.log" 2>&1 &)
sleep 3
# Find the real listener PID (not pnpm's wrapper process) so cleanup kills
# the right thing regardless of how pnpm shapes its child process tree.
SERVER_PID="$(lsof -i :8000 -sTCP:LISTEN -t 2>/dev/null | head -1)"
if ! curl -sf http://localhost:8000/docs/json > /dev/null; then
  echo "==> probe failed; server log:" >&2
  cat "$WORK/server.log" >&2
  exit 1
fi
echo "API is up"

kill "$SERVER_PID" 2>/dev/null || true
SERVER_PID=""

echo "E2E OK"
