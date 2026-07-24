# Automations Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** User-defined automations, end-to-end: a new `core/automations` bounded context (the eighth) with full CRUD over the API, event-triggered runs with persisted history, and an execution boundary — an `AutomationEngine` deployment port with an in-process default and a **Hatchet** adapter (`adapters/workflow-hatchet`) for durable execution. An automation binds a trigger (a domain event type) to an ordered list of actions (`docs/domain/automations.md`); v1 ships the `sendEmail` action.

**Architecture:** Automations are rows in `automations`, authored via `/api/automations`. The container subscribes the service to all events on the bus (`subscribeAll`); matching happens in `handle` — a new trigger is data, never wiring. The domain owns definitions and run history, never execution (doc boundary 3): the dispatch hands the engine the definition (run id + actions + event); the engine orders the steps and retries failures, calling the domain executor per action and once to finalize. `handle` never throws — an automation failure is recorded on its run, never surfaced as a bus delivery failure. `@headless-lms/adapter-workflow-hatchet` is a top-level adapter package like `adapter-email-resend`, injected by the installation; absent → `InlineAutomationEngine` (run now, in-process, once — dev works without Hatchet).

**Tech Stack:** TypeScript strict ESM, `@hatchet-dev/typescript-sdk`, Drizzle + Postgres, Fastify + `fastify-type-provider-zod`, zod 4 (`@headless-lms/api-contract`), vitest, tsdown, pnpm workspace.

## Global Constraints

- `@headless-lms/types` stays pure types — no runtime code, no dependencies.
- Adapter packages depend only on `@headless-lms/types` (+ `@headless-lms/utils` if needed) — never on the server.
- `core/` may not import `adapters/`, frameworks, or drizzle; contexts import each other only via `index.ts` (`pnpm lint` enforces; `.eslintrc.cjs` `CONTEXTS` gains `"automations"`).
- Org-scoped tables use the composite `(org_id, id)` PK shape (see `adapters/db/schema/entitlements.ts`).
- New tables via `pnpm db:generate` a new baseline, no migrations needed.
- Contract/route changes require `pnpm gen:sdk`; a stale committed `openapi.json`/SDK diff is an error.
- No AI-attribution trailers in commit messages (AGENTS.md).

## Decisions

| Decision | Choice |
|---|---|
| Scope | User-defined automations only. System-shipped automations come later on top of this base |
| Action types | `sendEmail` only; the discriminated union is the extension point for `integrationAction` / `wait` / `grantAccess` later |
| Failure semantics | `handle` catches everything — bus delivery always succeeds. A failing action throws to the engine, which retries per its policy; retries exhausted → sequence stops, run recorded `failed` (doc: `run.failed` fires after retries are exhausted) |
| Run recording | Run inserted `running` + `automation.run.started` in one uow at dispatch; `finalize` updates the row + appends `automation.run.completed|failed` and `automation.action.failed` per failed action. In-flight state stays in the engine |
| Domain events | Full catalog from the domain doc, plus `automation.deleted` from delete — not in the doc; flagged for the doc to adopt |
| Execution | `AutomationEngine` port; inline default; Hatchet adapter for durable per-action retries (waits/drips arrive with Hatchet durable sleep later) |
| Builder catalog | `GET /api/automations/available` — triggers, built-in action types (config schemas, valid templates per trigger), and every loaded plugin's actions, all resolved at runtime. The builder UI renders entirely from it; new triggers/actions/plugins appear without a frontend change. Plugin actions become authorable when the `integrationAction` union member lands |

## The contract (what every task builds against)

```ts
// packages/types/src/automations.ts
/** Any DomainEvent type. */
export type AutomationTrigger = string;

export type AutomationAction = { type: 'sendEmail'; template: EmailTemplateId };

export interface Automation {
  readonly id: string;
  name: string;
  description?: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];   // ordered
  enabled: boolean;
}

export interface CreateAutomationInput {
  name: string;
  description?: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
}
export type UpdateAutomationInput = Partial<CreateAutomationInput> & { enabled?: boolean };

export type AutomationRunStatus = 'running' | 'completed' | 'failed';

export interface AutomationActionResult {
  index: number;
  type: AutomationAction['type'];
  status: 'completed' | 'failed';
  error?: string;
}

export interface AutomationRun {
  readonly id: string;
  orgId: string;
  automationId: string;
  trigger: AutomationTrigger;
  event: DomainEvent;            // triggering event snapshot (jsonb)
  status: AutomationRunStatus;
  actionResults: AutomationActionResult[];
  startedAt: string;
  finishedAt: string | null;
}

// --- engine contract (deployment port) --------------------------------------
/** The definition handed off to be run (doc boundary 3). Serializable —
 *  action functions never cross this boundary. */
export interface AutomationDispatch {
  runId: string;
  orgId: string;
  automationId: string;
  actions: AutomationAction[];
  event: DomainEvent;
}

/** Domain-owned. The ENGINE orders the steps and retries failures; it calls
 *  runAction per step (throws on failure → engine retries per its policy;
 *  exhausted → sequence stops) and finalize exactly once at the end. */
export interface AutomationExecutor {
  runAction(d: AutomationDispatch, index: number): Promise<AutomationActionResult>;
  finalize(d: AutomationDispatch, results: AutomationActionResult[]): Promise<void>;
}

export interface AutomationEngine {
  /** Container wires the domain executor before start. */
  register(executor: AutomationExecutor): void;
  /** Hand a run off. Inline: runs now. Hatchet: workflow run, no-wait. */
  dispatch(d: AutomationDispatch): Promise<void>;
  /** Worker lifecycle — started by the installation entry point after listen
   *  (like outboxRelay), stopped by buildServer onClose. */
  start(): Promise<void>;
  stop(): Promise<void>;
}

// --- events — the catalog from docs/domain/automations.md --------------------
export interface AutomationCreated extends DomainEvent {
  type: 'automation.created';
  automation: Automation;
}
export interface AutomationUpdated extends DomainEvent {
  type: 'automation.updated';
  automation: Automation;
}
export interface AutomationDeleted extends DomainEvent {
  type: 'automation.deleted';
  automation: Automation;
}
export interface AutomationEnabled extends DomainEvent {
  type: 'automation.enabled';
  automationId: string;
}
export interface AutomationDisabled extends DomainEvent {
  type: 'automation.disabled';
  automationId: string;
}
export interface AutomationRunStarted extends DomainEvent {
  type: 'automation.run.started';
  run: AutomationRun;
}
export interface AutomationRunCompleted extends DomainEvent {
  type: 'automation.run.completed';
  run: AutomationRun;
}
export interface AutomationRunFailed extends DomainEvent {
  type: 'automation.run.failed';
  run: AutomationRun;
}
export interface AutomationActionFailed extends DomainEvent {
  type: 'automation.action.failed';
  runId: string;
  automationId: string;
  result: AutomationActionResult;
}
// Emit sites: created/updated/deleted ← CRUD writes; enabled/disabled ← an
// update that flips enabled; run.started ← handle's run-insert uow;
// run.completed|failed + action.failed ← finalize's uow.
```

---

### Task 1: Contract in `@headless-lms/types`

**Files:**
- Create: `packages/types/src/automations.ts` (the contract above)
- Modify: `packages/types/src/index.ts` (barrel line)

Pure type declarations; verification is `pnpm --filter @headless-lms/types build && pnpm typecheck`.

- [ ] Write `automations.ts` exactly as the contract section; import `DomainEvent` from `./shared.js`, `EmailTemplateId` from `./email-templates.js`.
- [ ] Barrel export.

### Task 2: `core/automations` context

**Files:**
- Create: `packages/server/src/core/automations/{service,actions,catalog,ports,model,types,events,index,service.test}.ts`
- Modify: `packages/server/src/core/shared/id.ts` (`ID_PREFIXES` + `automation: 'atm'`, `automationRun: 'run'`)
- Modify: `.eslintrc.cjs` (`CONTEXTS` + `"automations"`)

**Interfaces:**
- Consumes: `Mailer` (`core/shared/mailer.ts`), `OutboxAppender`/`UnitOfWork`/`Logger` (`core/shared/ports.ts`), types from Task 1.
- Produces: `AutomationsServiceImpl` (implements `AutomationsService` **and** `AutomationExecutor`), ports for Task 3.

```ts
// actions.ts — action runners. sendEmail derives recipient + params from the
// triggering event: entitlement.created|deleted carry the full snapshot →
// to = entitlement.studentEmail, accessGranted { contentTitle, contentId } /
// accessRevoked { contentTitle }. A pairing it can't derive → failed result
// (and absent from catalog.ts's valid pairings — e.g. progress.completed
// carries no recipient today, so courseCompleted has no valid trigger yet).

// catalog.ts — the code-owned catalog `available` serves: triggers ({ type,
// description }) and built-in action definitions ({ type, description, config
// schema, valid templates per trigger }) — the same source actions.ts derives from.

// ports.ts
export interface AutomationsService {
  handle(event: DomainEvent): Promise<void>;       // NEVER throws; no-match = no-op
  available(orgId): Promise<AutomationsAvailable>; // catalog + loaded plugins' actions
  list(orgId): Promise<Automation[]>;
  get(orgId, id): Promise<Automation | null>;
  create(orgId, input: CreateAutomationInput): Promise<Automation>;
  update(orgId, id, input: UpdateAutomationInput): Promise<Automation | null>;
  delete(orgId, id): Promise<boolean>;
  listRuns(orgId, automationId, query: AutomationRunsQuery): Promise<Page<AutomationRun>>;
}
export interface AutomationsRepository {
  insert / update / delete / findById(orgId, ...)
  listByOrg(orgId): Promise<Automation[]>
  listByTrigger(orgId, trigger): Promise<Automation[]>
}
export interface AutomationRunsRepository {
  insert(orgId, run: NewAutomationRun): Promise<AutomationRun>;
  recordOutcome(orgId, id, outcome: { status; actionResults; finishedAt }): Promise<AutomationRun | null>;
  list(orgId, automationId, query): Promise<Page<AutomationRun>>;
}
export interface AutomationsUnitOfWork extends UnitOfWork<{ automations; runs; outbox }> {}
```

Service behavior:
- `handle(event)`: match = enabled rows from `repo.listByTrigger(orgId, event.type)`. Per match, one uow: insert run (`running`) + append `automation.run.started`; then `engine.dispatch`. Whole body try/caught; a failure logs and records the run `failed`.
- `runAction(dispatch, index)`: run one action from the dispatched definition (sendEmail → Mailer). Throws on failure — the engine retries.
- `finalize(dispatch, results)`: one uow: `recordOutcome` + append `automation.run.completed|failed` and one `automation.action.failed` per failed result.
- `create`/`update`/`delete`: one uow each, appending `automation.created|updated|deleted`; an `update` that flips `enabled` appends `automation.enabled|disabled` instead of `updated` when nothing else changed.
- `list`/`get`: straight repo reads.
- `available(orgId)`: the code catalog + plugin actions from `integrations.available()` (each loaded plugin already declares its actions with input/output schemas — resolved at runtime, nothing registered twice). Automations consumes the integrations context via its `index.ts` public surface.

**Tests** (`service.test.ts`, fake repos/uow/engine per `core/integrations/service.test.ts` style): an enabled automation's trigger matches and runs (run inserted with `automation.run.started`, then dispatched); a disabled one doesn't; a non-matching event type is a no-op; `runAction` runs the right action and throws on mailer failure; sendEmail derives `to`/params from the event (entitlement snapshot → `{ contentTitle, contentId }`); an underivable pairing → failed result; `finalize` records `completed` + `automation.run.completed`, or `failed` + `automation.run.failed` + `automation.action.failed`; CRUD roundtrip appending `automation.created|updated|deleted`; enable/disable appending `automation.enabled|disabled`; `available` returns the catalog's triggers/actions plus every loaded plugin's actions.

### Task 3: Persistence

**Files:**
- Create: `packages/server/src/adapters/db/schema/automations.ts`, `packages/server/src/adapters/db/repositories/automations.ts`
- Modify: `packages/server/src/adapters/db/schema/index.ts` (barrel)
- Generate: `pnpm db:generate`

Tables (mirror `schema/entitlements.ts` conventions — `text` ids, `genId` defaults, org FK, timestamps):
- `automations`: `org_id`, `id` (`genId('automation')`), `name`, `description`, `trigger`, `actions` jsonb, `enabled` boolean default true, `created_at`, `updated_at`. PK `(org_id, id)`; index on `(org_id, trigger)`.
- `automation_runs`: `org_id`, `id` (`genId('automationRun')`), `automation_id`, `trigger`, `event` jsonb, `status`, `action_results` jsonb default `[]`, `started_at`, `finished_at` nullable. PK `(org_id, id)`; index on `(org_id, automation_id)`.

Repositories implement the Task 2 ports; runs `list` follows the entitlements pagination/sort conventions (`-field` desc, rows + `count(*)`; filter: `status`).

### Task 4: `InlineAutomationEngine` (server default)

**Files:**
- Create: `packages/server/src/adapters/workflows/index.ts` (+ colocated test)

`dispatch` runs the actions in order via `runAction` (single attempt, no retries — a failure stops the sequence) then calls `finalize`; `register` stores the executor; `start`/`stop` no-ops; `dispatch` before `register` throws. A working default, not a stub — dev and tests run without Hatchet.

### Task 5: `@headless-lms/adapter-workflow-hatchet`

**Files:**
- Create: `adapters/workflow-hatchet/{package.json,tsconfig.json,README.md,src/index.ts,src/index.test.ts}` (mirror `adapters/email-resend` package layout: tsdown build, vitest, deps `@headless-lms/types` + `@hatchet-dev/typescript-sdk`)

`HatchetAutomationEngine implements AutomationEngine`:
- Client from env (`HATCHET_CLIENT_TOKEN`; SDK reads its own env) — constructor takes the client (injectable for tests) or config.
- One workflow `automation-run`: a durable parent task iterates the dispatched actions, one child task per action calling `executor.runAction(dispatch, index)` (child-level `retries: 3`); a child exhausting its retries stops the sequence; the parent calls `finalize` with the collected results. Crash mid-run → resumes after the last completed action, not from the start.
- `dispatch` → workflow run no-wait with the dispatch as input. `start`/`stop` → worker lifecycle.
- Tests: fake Hatchet client — dispatch maps to a workflow-run call, the task chain calls `runAction` per action and `finalize` once, `stop` stops the worker. No Hatchet instance in CI.

### Task 6: Composition

**Files:**
- Modify: `packages/server/src/app/container.ts`, `packages/server/src/http/server.ts` (onClose), `packages/server/src/index.ts` (exports)
- Modify: `packages/server/src/core/shared/ports.ts` (EventBus + `subscribeAll`), `packages/server/src/adapters/events/index.ts` (+ test)
- Modify: `apps/api/src/main.ts`, `apps/api/src/config.ts` (Hatchet env), `apps/api/package.json`

EventBus gains `subscribeAll(handler)` (port + `InMemoryEventBus`): called for every published event.

Container:
- `AdapterOverrides` + `workflows?: AutomationEngine`; resolve `options?.adapters?.workflows ?? new InlineAutomationEngine()`.
- Build `automationsUow` (automations + runs repos + `DrizzleOutboxAppender`), `AutomationsServiceImpl` (deps include the `integrations` service, for `available`); `engine.register(service)`; `eventBus.subscribeAll((e) => automations.handle(e))`.
- Expose `automations` and `automationEngine` on `Container`. Engine started by the entry point after listen, stopped in `buildServer` onClose — the `outboxRelay` lifecycle exactly (gen-openapi must not start a worker).

apps/api: when `HATCHET_CLIENT_TOKEN` is set construct `HatchetAutomationEngine`, else omit the slot; `main.ts` starts it beside `outboxRelay.start()`.

### Task 7: API + SDK

**Files:**
- Create: `packages/api-contract/src/automations.ts`; modify `packages/api-contract/src/index.ts`
- Create: `packages/server/src/http/routes/automations.ts`; modify `packages/server/src/http/routes.ts`
- Regenerate: `pnpm gen:sdk` (commit `openapi.json` + `packages/sdk/src/generated`)

Schemas (conventions from `api-contract/src/entitlements.ts` + `shared.ts`): `AutomationAction` (discriminated union — `sendEmail` with a template-id enum), `Automation`, `CreateAutomationBody { name, description?, trigger, actions }`, `UpdateAutomationBody` (partial + `enabled?`), `AutomationRun`, `AutomationRunsQuery = ListQuery.extend({ status? })`, `AutomationRunsPage = paginated(AutomationRun)`, `AutomationIdParam`, `AutomationsAvailable { triggers: { type, description }[], actions: { type, description, config }[], integrations: { id, actions: { id, description, inputSchema, outputSchema }[] }[] }`.

Routes (tag `Automations`, `preHandler: app.requireSession`, org via `resolveScope`):
- `GET /api/automations` → `list`
- `GET /api/automations/available` → `available` (registered before `:id`)
- `POST /api/automations` → `create`
- `GET /api/automations/:id` → `get`; unknown id → `NotFoundError('Automation', id)`
- `PATCH /api/automations/:id` → `update`
- `DELETE /api/automations/:id` → `delete`
- `GET /api/automations/:id/runs` → `listRuns` (filter `status`)

### Task 8: Housekeeping

- [ ] `AGENTS.md`: seven → eight contexts; add `adapters/workflow-hatchet` to the adapters list; add `Automations` to the resource-tags list.
- [ ] `docs/project-structure.md` if it enumerates contexts/adapters.

## Verification

1. `pnpm test`, `pnpm typecheck`, `pnpm lint` (boundary rules accept the new context, reject deep imports) — all green at every task boundary.
2. `pnpm db:generate`; `pnpm db:migrate` applies cleanly to a dev DB.
3. `pnpm gen:sdk` — `Automations` resource class appears; committed spec/SDK diff is clean.
4. End-to-end, inline engine: `pnpm dev`; `POST /api/automations` (trigger `entitlement.created`, action `sendEmail: accessGranted`); grant an entitlement in admin → `automation_runs` row `completed` with the action result, email rendered (Resend adapter or fail-loudly stub logging), `GET /api/automations/:id/runs` returns it; `PATCH { enabled: false }` → grant again → no new run; `DELETE` → gone from `GET`.
5. End-to-end, Hatchet: `HATCHET_CLIENT_TOKEN` set against a local Hatchet (hatchet-lite), same flow runs through the worker; kill the API mid-run and restart → the run resumes (durable retry demonstrated).
