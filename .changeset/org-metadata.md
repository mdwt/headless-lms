---
"@headless-lms/core": minor
"@headless-lms/server": minor
"@headless-lms/sdk": minor
"@headless-lms/adapter-db": minor
---

An organization carries `metadata`, key-value strings. `POST /api/platform/organizations` takes optional `metadata` (at most 50 keys, keys up to 40 characters, values up to 500), stores it with the organization and returns it on `organization`. The API key created with the organization is always named `Platform`.

Breaking changes:

- `POST /api/platform/organizations` no longer takes `keyName`.
- `Organization` carries `metadata`, and `OrganizationsRepository` adds `setMetadata`.
