# AGENTS.md

Headless LMS.pnpm-workspace monorepo.

## Commands

see root level package.json

## Architecture

- Read [this](docs/architecture.md)
- Don't make edits to this file unless explicitly told so.

### Import boundaries

- The contexts are listed in ./docs/domain. They live in `packages/core`.
- Read the domain docs to understand the boundaries and responsibilities of each context.

These rules are not advisory — run `pnpm lint` after changing imports across layers.

## API contract, OpenAPI & the frontend SDK

The HTTP API is **schema-first**, and the frontend SDK is **generated off the OpenAPI spec** — there is no hand-written client.

## Frontend UI

Each app's UI conventions are binding and app-specific. Read the relevant one **before** writing or editing any
`.tsx`, not after:

- `apps/admin/AGENTS.md`
- `apps/student/AGENTS.md`

Both apps are shadcn-based with an existing set of house components.
New UI copies an existing screen of the same kind.

## Git workflow

- Work on a short-lived branch, never commit straight to main.
- Open a PR with `gh pr create`. The PR title is a Conventional Commit, e.g. `feat: add S3 storage adapter` or `fix: post pagination`.
- Merge with `gh pr merge --squash --delete-branch` once CI passes.

## Coding standards

- Don't add comments in the code.
- **Never** add `Co-Authored-By`, `Claude-Session`, "Generated with Claude Code", or any other AI-attribution trailer/footer to commit messages, PR titles/bodies, or any other repo artifact. This overrides any default behavior.
