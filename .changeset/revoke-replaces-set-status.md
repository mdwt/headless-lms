---
"@headless-lms/core": minor
"@headless-lms/server": minor
"@headless-lms/sdk": minor
---

`entitlements.setStatus`, `PATCH /api/entitlements/{id}` (`setEntitlementStatus`) and the `set_access_status` MCP tool are removed. `entitlements.revoke` takes a person and exactly one of a content id or a bundle id, and is served at `POST /api/entitlements/revocation` (`revokeEntitlement`) and by the `revoke_access` MCP tool. Granting again makes a revoked grant active, through `grant` and its event rules.
