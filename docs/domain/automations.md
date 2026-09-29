# Automations — Domain Spec

Automations is where the system reacts to things that happen. An automation binds triggers — events elsewhere in the system, like access being granted or a tag being added — to an ordered list of actions that should follow. Define it once, and it runs every time one of its triggers fires.

An automation is one of two kinds:

- A **workflow** is authored step by step: "when someone is granted this course, tag them and send a welcome sequence." Users build their own in the dashboard, and the system ships standard ones that encode the expected consequences of an action — granting access isn't just a grant; it's the grant plus the welcome email plus whatever tags belong on that learner.
- A **webhook** is an org's subscription to its own events: a URL and the events to send there. It is an automation with exactly one action — deliver the event to the URL — and it is managed as a URL and a set of events, never as steps.

The domain owns the automations themselves — what they are, what triggers them, what they do, and whether they're on. It does not run them. Running an automation durably — retrying a failed step, waiting days between actions, surviving restarts — is carried out by execution infrastructure the domain hands off to and does not own.

## Models

- **Automation** — its kind, the events that trigger it, an ordered list of actions, and a flag for whether it's enabled. It fires when any one of its triggers happens. A workflow's actions run in order: grant access, add or remove a tag, send an email, call an integration, wait a set period, or branch on a condition. A drip sequence is just emails interleaved with waits. A webhook's single action delivers the triggering event to its URL.
- **Webhook** — how a webhook automation is managed: its URL, the events it subscribes to, a description, and whether it's enabled. Each webhook has a signing secret, and every delivery is signed with it so the receiving system can verify the delivery came from this system. The webhook holds a reference to the secret, never the secret itself.
- **AutomationRun** — a record of one automation firing: which automation ran, the event that triggered it, when it started and finished, its outcome, and the result of each action within it. For a webhook, each run is one delivery. This is the audit trail — how a user sees which automations fired, what set them off, when, and whether each step succeeded or failed.

The domain stores what an automation is and the history of every time it ran. What it does not hold is the live state of a run still in progress — where a paused drip currently sits, how long is left on its wait — which lives with the execution infrastructure until the run completes and its outcome is recorded here.

## Capabilities

- **Author a workflow** — create and change its triggers and the actions that follow them. A workflow can't use the webhook delivery action.
- **Manage a webhook** — create one for a URL and a set of events, change its URL, events or description, and delete it. A webhook may only subscribe to events the system emits. Creating a webhook generates its signing secret; deleting it destroys the secret. A webhook changes only through these capabilities, never as a workflow.
- **Reveal or rotate a webhook's signing secret** — rotating replaces the secret at once; the old one stops verifying.
- **Turn one on or off** — an automation only fires while it's enabled.
- **Run the automations bound to an event** — when an event fires, find the enabled automations listening for it and set each running against it. An event runs at most once per automation, however many times it arrives.
- **Rerun a run** — run a finished run again, with the automation as it is now; its new outcome replaces the previous one. For a webhook, this resends the delivery.
- **Query run history** — see which automations ran, what triggered them, when, and what happened in each, down to the outcome of individual actions. History outlives the automation.

## Boundaries

1. **automations ↔ the contexts that act** — a workflow's actions are operations owned by other contexts. Automations doesn't grant access, add tags, or send email itself — it runs the action list in order and calls the context that owns each operation. Delivering a webhook is the one action automations owns: it sends the event, signed, to the webhook's URL.
2. **automations ↔ the contexts that trigger** — automations listens for the events other contexts emit and resolves which automations each event runs. The emitting context doesn't know automations exists. Automations' own events never trigger an automation, so a webhook can't subscribe to them.
3. **automations ↔ execution infrastructure** — automations hands a definition off to be run; the infrastructure orders the steps, retries failures, waits between actions, and resumes after a restart. A webhook delivery is a run like any other and is retried the same way. Automations keeps the definition and none of the running state.
4. **automations ↔ secure credential store** — a webhook's signing secret is held in the shared secure store, scoped to the org. Automations resolves it only to sign a delivery or when asked to reveal it.

## Events

- `automation.created` — an automation, workflow or webhook, is created.
- `automation.updated` — an automation's triggers or actions change; for a webhook, its URL, events or description.
- `automation.deleted` — an automation is deleted.
- `automation.enabled` — an automation is turned on.
- `automation.disabled` — an automation is turned off.
- `automation.run.started` — a triggered automation begins running.
- `automation.run.completed` — a run finishes successfully.
- `automation.run.failed` — a run fails after its retries are exhausted.
- `automation.action.failed` — a single action within a run fails.
