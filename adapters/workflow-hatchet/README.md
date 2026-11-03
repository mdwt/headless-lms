# @headless-lms/adapter-workflow-hatchet

Hatchet ([hatchet.run](https://hatchet.run)) implementation of the `AutomationEngine`
port from `@headless-lms/core/types` and the `Scheduler` port from
`@headless-lms/core/shared/ports` — durable execution for
dispatched automations, notification deliveries and scheduled jobs. One object
implements both ports; the container exposes it as `automationEngine` and `scheduler`.

The adapter declares one workflow, `automation-run`: a durable parent task that
iterates the dispatched actions, spawning one child task per action
(`automation-run-action`, `retries: 3`) through Hatchet's durable event log. A
child that exhausts its retries stops the sequence; the parent then calls
`finalize` exactly once with the results collected so far. Because children are
spawned via the durable event log, a crash mid-run resumes after the last
completed action instead of restarting the sequence from scratch.

Webhook deliveries run through the same workflow: a webhook is an automation whose
one action delivers the event, so a failed delivery is retried like any other action.

Two more tasks run on the same worker:

- `notification-delivery` sends one notification delivery (an email or a push) on its
  channel, with `retries: 3`. Its concurrency key is the delivery id with
  `maxRuns: 1` and `GROUP_ROUND_ROBIN`, so a second run for the same delivery queues
  instead of overlapping; on the last attempt a failing delivery is marked `failed`.
- `scheduled-job` runs the job a context registered under the input's `job` name with
  its payload, with `retries: 3` and a concurrency key of `job:key`. A one-off job
  (`Scheduler.at`) is a Hatchet scheduled run tagged with metadata `job` and `key`;
  a second `at` with the same key moves it, and `cancel` deletes it. A recurring
  product job is a cron named `hlms-job:{job}`, created, replaced or removed by
  `start()` to match the registered jobs. A firing whose job has no handler is
  logged and dropped.

`start()` registers every task on one worker, reconciles the product job crons and
starts the worker; call it after the server listens. The `automation-schedule` crons
for an org's own `schedule:` triggers are unchanged.

```ts
import { HatchetAutomationEngine } from "@headless-lms/adapter-workflow-hatchet";

const container = await createContainer(config, {
  adapters: { workflows: (logger) => new HatchetAutomationEngine(undefined, logger) },
});
```

The Hatchet client reads its own environment (`HATCHET_CLIENT_TOKEN` and friends —
see the [Hatchet docs](https://docs.hatchet.run/home/setup)); this adapter reads
none of it itself. Pass a pre-built client (or a fake, satisfying
`HatchetClientLike`) as the first constructor argument for tests or non-default
setups.

## Environment variables (Hatchet client, read by the SDK)

| Variable               | Required | Notes                                    |
| ---------------------- | -------- | ---------------------------------------- |
| `HATCHET_CLIENT_TOKEN` | yes      | Hatchet API token for the target tenant. |

See the Hatchet TypeScript SDK docs for the full set of `HATCHET_CLIENT_*` variables
(host/port, TLS, namespace, …).
