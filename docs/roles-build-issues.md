# Configurable roles: build log and issues

Spec: `docs/roles-spec.md`. Reviews: `docs/roles-spec-review.md`. Branch `feature/configurable-roles` in `headless-lms` and `hlms-community`.

Baseline at `451cdc5a`: `pnpm build` passes, `pnpm test` 1982 tests in 159 files pass.

## Progress

| Phase | Scope | Status |
|---|---|---|
| 1 | Permission list, levels, default set, actor, resolution (core) | open |
| 2 | `org_roles`, `role_assignments`, `assets.content_id`, migration (db) | open |
| 3 | Organizations: roles, assignments, rules, people, invites, transfer, removal | open |
| 4 | Better Auth: roles, adapter writes, refused paths, `ApiKeys` port | open |
| 5 | Server: `resolveActor`, routes and MCP tools on core methods, `operation` | open |
| 6 | Contexts take the actor and check: content, discussion, chats, entitlements, progress, assets, integrations, automations, reporting, notification categories | open |
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
