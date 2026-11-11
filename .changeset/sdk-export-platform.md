---
"@headless-lms/sdk": patch
---

The SDK exports `Platform`, with `createPlatformOrganization` and `createPlatformApiKey`. Pass the platform key per call: `Platform.createPlatformOrganization(input, { headers: { Authorization: "Bearer <platform key>" } })`.
