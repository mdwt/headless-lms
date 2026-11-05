---
"@headless-lms/core": patch
"@headless-lms/adapter-defaults": patch
---

`describeError` (in `@headless-lms/core/shared/logger`) turns an error into a log line that names the cause: each distinct inner error of an `AggregateError`, and the error code when the message leaves it out. A refused Postgres connect is an `AggregateError` with an empty message, so `outbox poll failed` logged only "AggregateError" and the PubSub adapter's connect and listener errors logged an empty string. The outbox relay, the PubSub adapter and the live chat forwarder and hub use it for their errors, and the relay for the stored `last_error`; `live publish failed` had logged an empty error while PubSub was down.
