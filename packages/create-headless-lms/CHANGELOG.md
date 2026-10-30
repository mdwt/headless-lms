# create-headless-lms

## 0.1.2

### Patch Changes

- Communities with spaces, posts, chats, moderation and member profiles; an MCP server with OAuth sign-in, connected apps and scoped API keys; access-checked proxy URLs for every file; per-person notification preferences; one API error envelope and request limits; security hardening across automations, auth and webhooks. Breaking: an organization no longer edits a person's name or email.

## 0.1.1

### Patch Changes

- [`f66e702`](https://github.com/mdwt/headless-lms/commit/f66e70258c748f01b966201a697707591dd06cef) Thanks [@mdwt](https://github.com/mdwt)! - Resolve @headless-lms/* dependency versions from the npm registry at scaffold time. The template hardcoded ^0.0.0, which was never published, so pnpm install failed in every scaffolded project (and migrate with it).

## 0.1.0

### Minor Changes

- 0f137b9: Initial public release
