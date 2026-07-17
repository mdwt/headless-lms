# @headless-lms/plugin-slack

Slack integration for the platform: posts domain events (e.g. student
enrollments) to a Slack channel, formatted per event type.

## Actions

| id | What it does |
| --- | --- |
| `postToChannel` | Posts a domain event to a channel. Input: `{ channel?, body }` where `body` is the event (`{ type, ...metadata }`). `enrollment.*` events get rich Block Kit formatting; unknown types post generically. `channel` falls back to the connection's `defaultChannel`. |
| `listChannels` | Lists public channels (for channel pickers). Paginated via `cursor`/`limit`. |

Formatted enrollment events: `enrollment.created`, `enrollment.updated`,
`enrollment.deleted`, `enrollment.expired` — each carrying an `enrollment`
object (student name/email, course title, granted/expires timestamps).

## Connecting

1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps).
2. OAuth & Permissions → add bot scopes `chat:write` (post) and `channels:read` (list).
3. Install to workspace and copy the Bot User OAuth Token (`xoxb-…`).
4. Connect the integration with secret `botToken` and config `defaultChannel`
   (invite the bot to that channel).

## Wiring

Implements the `Integration` contract from `@headless-lms/types`, using the
zod helpers from `@headless-lms/utils`.
The api loads it through the plugin folder convention:
`apps/api/src/plugins/slack/index.ts` re-exports this package's default export.

## Develop

```bash
pnpm --filter @headless-lms/plugin-slack build
pnpm --filter @headless-lms/plugin-slack test
```
