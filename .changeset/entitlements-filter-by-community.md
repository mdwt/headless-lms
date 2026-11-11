---
"@headless-lms/core": patch
"@headless-lms/server": patch
"@headless-lms/sdk": patch
---

The entitlements list filters by every content type: `type=community` is accepted on `GET /api/entitlements` and the `list_access` MCP tool, next to `course`, `download` and `event`.
