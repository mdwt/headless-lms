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
| 5 | Server: `resolveActor`, routes and MCP tools on core methods, `operation` | done |
| 6 | Contexts take the actor and check: content, discussion, chats, entitlements, progress, assets, integrations, automations, reporting, notification categories | done; 2114 tests pass, lint clean |
| 7 | Events, notifications, emails | done; role.assigned email verified end to end |
| 8 | Admin app, student app | open |
| 9 | Community app (`hlms-community`) | open |
| 10 | SDK, OpenAPI, MCP catalogue, docs | open |
| 11 | Tests (section 19) | open |
| 12 | End to end on a running stack | in progress: API scenarios: people and roles 52/52, access and moderation 47/47, custom roles, media and people 39/39, limits and events 10/10 (102 memberships, REST and MCP agree, a demoted creator's key narrows on the next request, org events at version 2); no error lines in the API log |

## Issues

Each issue: status `open`, `fixed` or `wontfix`, and the fixing commit.

| # | Found in | Issue | Status | Commit |
|---|---|---|---|---|
| 1 | Build | Commit `2d9ca69e` (content agent, assets message) also carries the assets agent's in-progress edits to `packages/core/src/assets/service.test.ts`. Content is intact; only the attribution is mixed. | wontfix | 2d9ca69e |
| 2 | E2E, MCP | A key with only course scopes was shown `remove_comment`, `remove_post`, `remove_post_comment` and `list_space_members`: their methods are declared `member` (authors remove their own), so the listing showed them to every token. The call was still refused by core. Tools now carry `listedFor`, used only for listing. | fixed | 7d427077 |
| 3 | E2E, docs | API descriptions and comments still said "staff" (`CreatePost.mode`, comment schemas, identity types). | fixed | 7d427077 |
| 4 | E2E, env | Member invite links pointed at `localhost:8002`: `STUDENT_PORTAL_URL` wasn't set for the test stack. Environment only, no code change. | fixed | env |
| 5 | E2E, roles | A role the org adds gets the key `role_<ksuid>`; the ksuid has capitals, which `roleKeySchema` refused (lowercase only). Giving, inviting with, or deleting an added role answered 400. The schema now allows letters after the first lowercase one; a test covers generated keys. | fixed | 389b43da |
| 6 | E2E, routes | `GET /api/member/org` named the system-only `organizations.getById`. It now names `organizations.portalIdentity`, declared `public`; a server test refuses any route on a `system` operation. | fixed | ae799374 |
| 7 | Apps, SDK | `@headless-lms/sdk` didn't export the new `People` and `Roles` classes, so invites, roles and people were unreachable from the apps. | fixed | ae799374 |

