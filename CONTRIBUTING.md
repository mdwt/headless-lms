# Contributing

## Setup

Node ≥22, pnpm 10, Docker. Then follow "Developing this repo" in the
[README](README.md) — install, compose up, migrate, `pnpm dev`.

## Before you open a PR

```bash
pnpm lint        # includes the architecture boundary rules — these are enforced, not advisory
pnpm typecheck
pnpm test
```

If you changed anything under `packages/server/src/http/schemas/` or
`packages/server/src/http/routes/`, run `pnpm gen:sdk` and commit the
regenerated `packages/sdk/openapi.json` and `src/generated/` — a stale diff
fails review.

## Commits

Conventional commits: `feat(scope): …`, `fix: …`, `docs: …`, `build: …`.

## Where things go

The layering (what may import what, where schemas and repositories live, how
integrations plug in) is documented in [AGENTS.md](AGENTS.md) and
`docs/architecture.md`. ESLint enforces the boundaries; if `pnpm lint` rejects
an import, the fix is moving the code, not silencing the rule.

## Use of AI

We use AI to improve the development speed and quality of the codebase.
If you contribute code, please keep in mind that we'll review the PRs. We expect you to know the architecture of the system
and how everything fits together. We won't spend time reviewing massive AI generated PRs. Reach out to discuss
if you're planning on adding something :)
