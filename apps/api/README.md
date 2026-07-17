# @headless-lms/api

The repo's own installation of `@headless-lms/server` — the same shape
`create-headless-lms` scaffolds. It owns only:

- `src/config.ts` — env → `ServerConfig`
- `src/main.ts` — container → server → listen (port 8000)
- `src/plugins/` — integrations, one folder per integration (directory name =
  integration id); `slack/` is a thin re-export of `@headless-lms/plugin-slack`
- `scripts/gen-openapi.ts` — boots the app in-process and writes
  `packages/sdk/openapi.json` (used by `pnpm gen:sdk`)

## Run

```bash
pnpm --filter @headless-lms/api dev          # tsx watch, reads root .env
pnpm --filter @headless-lms/api db:migrate   # headless-lms CLI via tsx
pnpm --filter @headless-lms/api seed
```

Needs Postgres + MinIO: `docker compose -f docker/docker-compose.yml up -d`.
OpenAPI docs at `http://localhost:8000/docs`.
