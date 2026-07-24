# Automations admin UI

Back-office surface for the automations context: a list view with CRUD and a
flow-style editor that builds the automation config object (`trigger` +
ordered `actions`) and stores it through the existing API.

## Routes

- `/automations` — list page, manager-gated (like Students/Entitlements).
- `/automations/new` — editor, blank draft.
- `/automations/[automationId]` — editor loading an existing automation.

Nav: top-level "Automations" item (Workflow icon) between Students and
Settings; `visibleNav` gains an `automations` key, manager-only.

## List page

`GET /api/automations` returns the full array (no server pagination), so the
RSC page applies search/facets/sort/slice in memory using the same
`parseListParams` output every other list uses — the `DataTable` island stays
byte-identical to the entitlements/students pattern (URL-driven state, SSR'd
deep links).

- Columns: Name (name + description subtitle), Trigger (badge), Steps (action
  count + type summary), Enabled (Switch — optimistic PATCH), row actions.
- Facets: Enabled (Enabled/Disabled), Trigger (from the triggers catalog).
- Row actions: Edit (→ editor), Delete (→ `ConfirmDialog`, destructive; copy
  notes run history is retained — the API keeps runs as an audit trail).
- Toolbar: "New automation" → `/automations/new`; matching empty state.
- Server actions (`actions.ts`): `createAutomationAction`,
  `updateAutomationAction`, `deleteAutomationAction` — SDK calls +
  `revalidatePath("/automations")`, mirroring entitlements.

## Editor

Full-page flow builder, Zapier-style vertical chain rendered with React Flow
(`@xyflow/react`), themed on the app's ink/line/surface tokens.

- Header: back link, inline name input + description, Enabled switch, Save
  (create → `router.replace` to the new id), Delete (existing only, same
  confirm dialog).
- Canvas: custom nodes — one TriggerNode, then one ActionNode per step —
  auto-laid-out vertically (fixed positions, `nodesDraggable={false}` so the
  chain always reads as an ordered list), edges carry an insert "+" button,
  trailing "Add step" affordance. Background dots, Controls, `fitView`.
- Selecting a node opens the config panel (right, bordered):
  - Trigger node → trigger Select from `GET /automations/triggers` (type +
    description).
  - Action node → action type Select from `GET /automations/actions` (grouped
    by `source`: system vs integration), then `SchemaFields` renders the
    action's `inputSchema` (reusing the integrations form renderer), plus
    move up/down and remove.
- Draft state: single `{ name, description, trigger, actions, enabled }`
  object in the editor root; the panel mounts a small RHF form per selected
  node (keyed by index+type so switching remounts with `schemaDefaults`) and
  syncs changes back via watch.
- Validation on save: name and trigger required; every action needs a type
  and its schema-required inputs — violations mark the node and block save
  with a toast. The API contract re-validates server-side (400 → error toast).

## Data plumbing

- `lib/api/types.ts`: `Automation`, `AutomationAction`, `AvailableAction`,
  `AutomationTrigger` types derived from SDK responses.
- `lib/api/server.ts`: `listAutomations`, `getAutomation`,
  `automationActions`, `automationTriggers` (reads only, per the existing
  split; mutations live in the route's server actions).
- New dependency: `@xyflow/react` in `apps/admin`.

## Testing

Admin app has no test runner wired (no vitest config/scripts); verification is
`pnpm typecheck`, `pnpm lint`, an admin `next build`, and driving the running
app: create → configure trigger/steps → save → toggle → delete.
