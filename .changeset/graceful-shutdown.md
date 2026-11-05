---
"@headless-lms/server": minor
"create-headless-lms": patch
---

`closeOnSignals(app)` closes the server on SIGTERM or SIGINT so its close hooks run: open chat streams get `closed { reason: 'shutdown' }`, the outbox relay drains, the automation engine stops and PubSub unlistens. A second signal, or a close that takes longer than 10 s, exits at once. The API entry point and the project template call it after `listen`. Before this, nothing closed the server on a signal, and the Hatchet worker's own signal handler exited the process as soon as the worker stopped. `adapter-workflow-hatchet` now starts its worker with `handleKill: false` and logs `hatchet worker stopped`.
