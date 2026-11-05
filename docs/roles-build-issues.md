# Configurable roles: build log and issues

Spec: `docs/roles-spec.md`. Reviews: `docs/roles-spec-review.md`. Branch `feature/configurable-roles` in `headless-lms` and `hlms-community`.

Baseline at `451cdc5a`: `pnpm build` passes, `pnpm test` 1982 tests in 159 files pass.

## Test stack

- Database `headless_lms_roles` on the local Postgres (`localhost:8005`), all migrations through `0017_configurable_roles` applied.
- Hatchet `headless-lms-hatchet-roles` (gRPC `localhost:8028`, dashboard `localhost:8029`), its own database `hatchet_roles`, so no other stack's worker picks up these jobs.
- API `localhost:8200`, admin `localhost:8201`, student `localhost:8202`, community app `localhost:3200`.
- Email: `EMAIL_SINK_DIR` writes every email (JSON + HTML) to a directory; `RESEND_API_KEY` is empty, nothing is sent.

## Progress

| Phase | Scope | Status |
|---|---|---|
| 1 | Permission list, levels, default set, actor, resolution (core) | done |
| 2 | `org_roles`, `role_assignments`, `assets.content_id`, migration (db) | done; applied to a fresh database |
| 3 | Organizations: roles, assignments, rules, people, invites, transfer, removal | done, 33 service tests |
| 4 | Better Auth: roles, adapter writes, refused paths, `ApiKeys` port | done, 74 adapter tests |
| 5 | Server: `resolveActor`, routes and MCP tools on core methods, `operation` | in progress (organizations, access and content done) |
| 6 | Contexts take the actor and check: content, discussion, chats, entitlements, progress, assets, integrations, automations, reporting, notification categories | in progress (content done) |
| 7 | Events, notifications, emails | open |
| 8 | Admin app, student app | open |
| 9 | Community app (`hlms-community`) | open |
| 10 | SDK, OpenAPI, MCP catalogue, docs | open |
| 11 | Tests (section 19) | open |
| 12 | End to end on a running stack | open |

## Issues

Each issue: status `open`, `fixed` or `wontfix`, and the fixing commit.

| # | Found in | Issue | Status | Commit |
|---|---|---|---|---|
| 1 | Build | Commit `2d9ca69e` (content agent, assets message) also carries the assets agent's in-progress edits to `packages/core/src/assets/service.test.ts`. Content is intact; only the attribution is mixed. | wontfix | 2d9ca69e |
