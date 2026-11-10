---
"@headless-lms/core": minor
"@headless-lms/server": minor
"@headless-lms/sdk": patch
---

Only a signed-in person can create an API key. `POST /api/access/api-keys` answers 403 when the request is made with an API key or an app token. `EffectivePermissions` has `isToken()`, true for a caller that is a key or an app token.
