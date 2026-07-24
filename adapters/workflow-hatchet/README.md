# @headless-lms/adapter-workflow-hatchet

Hatchet ([hatchet.run](https://hatchet.run)) implementation of the `AutomationEngine`
port from `@headless-lms/types` — durable execution for dispatched automations.

The adapter declares one workflow, `automation-run`: a durable parent task that
iterates the dispatched actions, spawning one child task per action
(`automation-run-action`, `retries: 3`) through Hatchet's durable event log. A
child that exhausts its retries stops the sequence; the parent then calls
`finalize` exactly once with the results collected so far. Because children are
spawned via the durable event log, a crash mid-run resumes after the last
completed action instead of restarting the sequence from scratch.

```ts
import { HatchetAutomationEngine } from "@headless-lms/adapter-workflow-hatchet";

const container = await createContainer(config, {
  adapters: { automationEngine: new HatchetAutomationEngine() },
});
```

The Hatchet client reads its own environment (`HATCHET_CLIENT_TOKEN` and friends —
see the [Hatchet docs](https://docs.hatchet.run/home/setup)); this adapter reads
none of it itself. Pass a pre-built client (or a fake, satisfying
`HatchetClientLike`) as the first constructor argument for tests or non-default
setups.

## Environment variables (Hatchet client, read by the SDK)

| Variable              | Required | Notes                                   |
| --------------------- | -------- | ---------------------------------------- |
| `HATCHET_CLIENT_TOKEN` | yes     | Hatchet API token for the target tenant. |

See the Hatchet TypeScript SDK docs for the full set of `HATCHET_CLIENT_*` variables
(host/port, TLS, namespace, …).
