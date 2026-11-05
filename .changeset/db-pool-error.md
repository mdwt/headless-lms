---
"@headless-lms/adapter-db": patch
"@headless-lms/server": patch
---

`createDb` takes a logger and listens for errors on its pool. Before this, Postgres terminating an idle pooled connection (a restart, a failover, `pg_terminate_backend`) emitted an `error` event nobody handled, and the API process crashed. It now logs `database connection lost` and the pool replaces the connection; the container passes its logger as `db`.
