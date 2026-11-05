# Live chat testing on feature/configurable-roles

Testing live chat after merging `worktree-realtime-chat` into `feature/configurable-roles` (merge `6d6a097c`). Design: `docs/realtime-chat.md`. Community app: `hlms-community` on its `feature/configurable-roles` branch.

## Stack

- API on :8200 from this worktree, `.env` with `DATABASE_URL` on `headless_lms_roles`; emails go to the local email sink, none to Resend.
- Community app on :3200, admin on :8201, student on :8202.
- Postgres `headless-lms-postgres` on :8005, `max_connections` raised from 100 to 300 for this run; the automated suites use `headless_lms_test_chat`.
- Test users on `@checkoutjoy.com`.

## Progress

| # | Area | Status |
|---|---|---|
| 1 | Automated suites | open |
| 2 | Functional, two browsers | open |
| 3 | Connection lifecycle | open |
| 4 | Access and session | open |
| 5 | Multiple instances behind a proxy | open |
| 6 | Infrastructure | open |
| 7 | Load and measurements | open |
| 8 | Regression | open |

## Issues

| # | Area | Issue | Status | Fix |
|---|---|---|---|---|

## Log
