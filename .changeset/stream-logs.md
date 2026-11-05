---
"@headless-lms/server": patch
---

The chat event stream logs `event stream ended` at info when it ends, with how long it was open, how many events it carried and why it ended (`client`, `server`, `undrained` or `error`). Fastify's own `request completed` line is missing when the client is the one to disconnect.
