# Automations — Domain Spec

Automations is where the system reacts to things that happen. An automation binds triggers — events elsewhere in the system, like access being granted or a tag being added — to an ordered list of actions that should follow. Define it once, and it runs every time one of its triggers fires.

An automation is one of two kinds:

- A **workflow** is authored step by step: "when someone is granted this course, tag them and send a welcome sequence." Users build their own in the dashboard.
- A **webhook** is an org's subscription to its own events: a URL and the events to send there. It is an automation with exactly one action — deliver the event to the URL — and it is managed as a URL and a set of events, never as steps.

The domain owns the automations themselves — what they are, what triggers them, what they do, and whether they're on. It does not run them. Running an automation durably — retrying a failed step, waiting days between actions, surviving restarts — is carried out by execution infrastructure the domain hands off to and does not own.

## Models

- **Automation** — its kind, the events that trigger it, an ordered list of actions, and a flag for whether it's enabled. It fires when any one of its triggers happens. A workflow's actions run in order: grant access, add or remove a tag, send an email, call an integration, wait a set period, or branch on a condition. A drip sequence is just emails interleaved with waits. A webhook's single action delivers the triggering event to its URL.
- **Webhook** — how a webhook automation is managed: its URL, the events it subscribes to, a description, and whether it's enabled. Each webhook has a signing secret, and every delivery is signed with it so the receiving system can verify the delivery came from this system. The webhook holds a reference to the secret, never the secret itself.
- **AutomationRun** — a record of one automation firing: which automation ran, the event that triggered it, when it started and finished, its outcome, and the result of each action within it. For a webhook, each run is one delivery. This is the audit trail — how a user sees which automations fired, what set them off, when, and whether each step succeeded or failed.

An automation's triggers are events or schedules. A schedule fires at the times a cron expression names, in UTC; one the system cannot match is refused when the automation is saved. A trigger can carry a filter, an equality match on fields of the event, so "a post was published in this community" differs from "a post was published anywhere".

Every automation is the org's own, and product behaviour is not an automation. Nothing is seeded when an org or a community is created, and no org can switch product behaviour off. Timed product work — publishing a scheduled post, expiring grants, opening a community's digest, removing member uploads nothing uses — is a job that the context owning the work defines and the scheduler runs, at a time or on a recurring schedule. The scheduler is carried out by the same execution infrastructure that runs automations; no system automation remains. An org's own scheduled automations run as before.

## Notifications

Automations also runs the notification process, in code. It is not an automation: it has no definition an org authors and none can edit or turn it off. When an event happens, automations works out who the event concerns and why, from the data of the context that owns it: the author of the post, the people following it, the members of the space, the person whose grant changed. It files each person's notification under the first matching category of the community, or of the org for what happens outside any community, applies the person's own settings to decide the channels, and stores one notification per person: the in-app notification, and a delivery for each other channel that is on. Each delivery runs on the execution infrastructure, which retries a failed one without repeating the others. A run of chat messages notifies each participant once the chat has been quiet for two minutes, and not at all if they read it by then. A community's digest goes out on the community's own schedule.

- **Notification** — the message for one person about one event: what kind it is, why the person got it, the category it was filed under, the community and space it happened in, who acted, what it is about, the text it showed when sent, and when the person read it.
- **Delivery** — one send of a notification on one channel other than in-app, by email or by push: pending, sent or failed, with the last error.

The domain stores what an automation is and the history of every time it ran. What it does not hold is the live state of a run still in progress — where a paused drip currently sits, how long is left on its wait — which lives with the execution infrastructure until the run completes and its outcome is recorded here.

## Capabilities

- **Author a workflow** — create and change its triggers and the actions that follow them. A workflow can't use the webhook delivery action.
- **Manage a webhook** — create one for a URL and a set of events, change its URL, events or description, and delete it. A webhook may only subscribe to events the system emits. Creating a webhook generates its signing secret; deleting it destroys the secret. A webhook changes only through these capabilities, never as a workflow.
- **Reveal or rotate a webhook's signing secret** — rotating replaces the secret at once; the old one stops verifying.
- **Turn one on or off** — an automation only fires while it's enabled.
- **Grant access** — an action that gives the person the event names access to a content item or bundle. Running it again changes nothing: an active grant keeps the later expiry, a revoked grant stays revoked.
- **Fire a schedule** — at each matching time, run the automations scheduled for it. A time is run once per automation.
- **Run the automations bound to an event** — when an event fires, find the enabled automations listening for it and set each running against it. An event runs at most once per automation, however many times it arrives.
- **Rerun a run** — run a finished run again, with the automation as it is now; its new outcome replaces the previous one. For a webhook, this resends the delivery.
- **Query run history** — see which automations ran, what triggered them, when, and what happened in each, down to the outcome of individual actions. History outlives the automation.

## Boundaries

1. **automations ↔ the contexts that act** — a workflow's actions are operations owned by other contexts. Automations doesn't grant access, add tags, or send email itself — it runs the action list in order and calls the context that owns each operation. Delivering a webhook is the one action automations owns: it sends the event, signed, to the webhook's URL.
2. **automations ↔ the contexts that trigger** — automations listens for the events other contexts emit and resolves which automations each event runs. The emitting context doesn't know automations exists. It does decide which of its events' fields may leave the system, and a webhook delivers only those. Automations' own events never trigger an automation, so a webhook can't subscribe to them.
3. **automations ↔ execution infrastructure** — automations hands a definition off to be run; the infrastructure orders the steps, retries failures, waits between actions, and resumes after a restart. A webhook delivery is a run like any other and is retried the same way. Automations keeps the definition and none of the running state. It also stores the notifications it sent and the status of each delivery; the infrastructure runs and retries each delivery, and holds the timers of the scheduled jobs and the chat quiet period.
4. **automations ↔ notification inputs** — the categories are content's for a community and organizations' for the org; each person's settings and devices are identity's; follows, mutes and mentions are discussion's; who can open what is entitlements'. Automations reads them and owns none of them.
5. **automations ↔ secure credential store** — a webhook's signing secret is held in the shared secure store, scoped to the org. Automations resolves it only to sign a delivery or when asked to reveal it.

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
