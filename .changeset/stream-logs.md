---
"@headless-lms/server": patch
"@headless-lms/core": patch
---

The chat event stream logs `event stream ended` at info when it ends, with how long it was open, how many events it carried and why it ended (`client`, `server`, `undrained` or `error`). Fastify's own `request completed` line is missing when the client is the one to disconnect. The chat hub logs `chat stream closed` at info, with the member and the reason, when the 30 s check closes a stream for its session or for access.
