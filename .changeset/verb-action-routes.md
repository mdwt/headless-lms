---
"@headless-lms/server": minor
"@headless-lms/sdk": minor
---

Action routes end in a verb. `/approval`, `/removal`, `/restoration`, `/flags/resolution`, `/acceptance`, `/refusal` and `/submission` are now `/approve`, `/remove`, `/restore`, `/flags/resolve`, `/accept`, `/refuse` and `/submit`. `POST /api/organizations/ownership` is `POST /api/organizations/transfer-ownership`. Registering for an event is `POST /api/member/events/{eventId}/register` and cancelling it is `POST /api/member/events/{eventId}/unregister`, replacing `POST` and `DELETE` on `/registration`. Operation ids and SDK function names are unchanged.
