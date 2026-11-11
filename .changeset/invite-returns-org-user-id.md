---
"@headless-lms/core": patch
"@headless-lms/server": patch
"@headless-lms/sdk": patch
---

Creating an invite returns the invited person's `orgUserId`, so access and item roles can be given to them without looking the person up. `POST /api/organizations/invites` and the `invite_person` and `invite_student` MCP tools return it.
