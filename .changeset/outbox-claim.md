---
"@headless-lms/adapter-db": patch
---

`DrizzleOutboxStore.fetchBatch` claims the messages it returns for `OUTBOX_CLAIM_MS` (60 s), so with several API instances each event is dispatched by one relay instead of by every relay polling at the time. A relay that stops mid-batch leaves its messages to the others once the claim lapses.
