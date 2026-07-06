# Automations — Domain Spec

Automations is where the system reacts to things that happen. An automation binds a trigger — some event elsewhere in the system, like access being granted or a tag being added — to an ordered list of actions that should follow. Define it once, and it runs every time its trigger fires.

Automations come from two places. A user builds their own in the dashboard: "when someone is granted this course, tag them and send a welcome sequence." And the system ships standard ones that encode the expected consequences of an action — granting access, for instance, isn't just a grant; it's the grant plus the welcome email plus the webhook plus whatever tags belong on that learner. Both are the same kind of thing: a trigger and the actions that follow it.

The domain owns the automations themselves — what they are, what triggers them, what they do, and whether they're on. It does not run them. Running an automation durably — retrying a failed step, waiting days between actions, surviving restarts — is carried out by execution infrastructure the domain hands off to and does not own.

## Models

- **Automation** — a trigger and an ordered list of actions, plus a flag for whether it's enabled. The trigger is the event it listens for. The actions run in order when it fires: grant access, add or remove a tag, send an email, call a webhook or integration, wait a set period, or branch on a condition. A drip sequence is just emails interleaved with waits.
- **AutomationRun** — a record of one automation firing: which automation ran, the event that triggered it, when it started and finished, its outcome, and the result of each action within it. This is the audit trail — how a user sees which automations fired, what set them off, when, and whether each step succeeded or failed.

The domain stores what an automation is and the history of every time it ran. What it does not hold is the live state of a run still in progress — where a paused drip currently sits, how long is left on its wait — which lives with the execution infrastructure until the run completes and its outcome is recorded here.

## Capabilities

- **Author an automation** — create and change a trigger and the actions that follow it.
- **Turn one on or off** — an automation only fires while it's enabled.
- **Run the automations bound to an event** — when an event fires, find the automations listening for it and set them running against it.
- **Query run history** — see which automations ran, what triggered them, when, and what happened in each, down to the outcome of individual actions.

## Boundaries

1. **automations ↔ the contexts that act** — an automation's actions are operations owned by other contexts. Automations doesn't grant access, add tags, send email, or deliver webhooks itself — it runs the action list in order and calls the context or adapter that owns each operation.
2. **automations ↔ the contexts that trigger** — automations listens for the events other contexts emit and resolves which automations each event runs. The emitting context doesn't know automations exists.
3. **automations ↔ execution infrastructure** — automations hands a definition off to be run; the infrastructure orders the steps, retries failures, waits between actions, and resumes after a restart. Automations keeps the definition and none of the running state.

## Events

- `automation.created` — an automation is created.
- `automation.updated` — an automation's trigger or actions change.
- `automation.enabled` — an automation is turned on.
- `automation.disabled` — an automation is turned off.
- `automation.run.started` — a triggered automation begins running.
- `automation.run.completed` — a run finishes successfully.
- `automation.run.failed` — a run fails after its retries are exhausted.
- `automation.action.failed` — a single action within a run fails.
