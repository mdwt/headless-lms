# Reporting — Read Layer

Not a domain. A dedicated read-side that exists only for composed reads across contexts. It calls each context's public service (or reads purpose-built read tables) and assembles views such as the students list and the dashboard overview. It owns no write logic and no domain rules — it is a query layer.

## Why it lives outside `core/`

A domain owns data and business rules and depends on nothing outward. Reporting owns no data and no rules — it reads many domains' public surfaces. Putting it in `core/` next to the domains would grant it the one privilege domains explicitly do not have: depending on multiple other contexts. That would break the symmetry that makes the core's boundaries enforceable. Reporting is structurally different from a domain, so it sits apart.

## Location

`apps/api/src/reporting/`, a sibling of `core/`, `http/`, and `composition/`. It is an application-level concern that composes domain outputs, not a domain itself.

## Contents

- **`reporting/students/`** — the students-list view (identity user + `enrollmentCount` from entitlements + `avgProgress` from progress), paged/filtered/org-scoped.
- **`reporting/dashboard/`** — the cross-domain overview stats.

## Dependency rules (enforced by the boundary linter)

- `reporting/` may import any `core/<ctx>/index.ts` public surface (the only place allowed to read multiple contexts).
- `reporting/` may not import `adapters/`, `http/`, or another context's internals.
- `core/` may not import `reporting/`.
- Inbound (`http/`) and `composition/` may import `reporting/`.

## Read tables (optional)

If a composed read needs its own persistence for performance, reporting may own purpose-built **read tables** populated from domain events; these are read models, not domain tables, and live under `adapters/db/schema/reporting.ts`. Not required initially — the first cut composes public services.
