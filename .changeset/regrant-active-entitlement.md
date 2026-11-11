---
"@headless-lms/core": patch
"@headless-lms/server": patch
"@headless-lms/sdk": patch
---

Granting an entitlement to someone who already holds it no longer emits `entitlement.created`, so the access granted email and push are not sent again. When the expiry is the same, nothing is written and no event is emitted. When the expiry is different, the grant gets the new expiry and `entitlement.updated` is emitted. Granting a revoked or expired grant again still emits `entitlement.created`.
