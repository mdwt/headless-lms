# @headless-lms/api-contract

The **single source of truth** for the HTTP API: plain [Zod](https://zod.dev) (v4)
schemas describing each resource's payloads and query params. No framework deps.

These schemas are consumed three ways, so they never drift:

1. **Request + response validation** — `apps/api` attaches them to Fastify routes
   via `fastify-type-provider-zod`.
2. **OpenAPI spec** — `@fastify/swagger` builds the spec from the same route schemas.
3. **Generated SDK** — `@headless-lms/sdk` is generated off that spec.

## Layout

```
src/
  shared.ts    ErrorBody, ListQuery, paginated() — primitives reused across resources
  courses.ts   Course, CreateCourse, UpdateCourse, CoursesQuery, CoursesPage, …
  index.ts     public barrel
```

## Adding a resource

1. Add `src/<resource>.ts` exporting the schemas (entity, create/update inputs,
   list query, page) — reuse `ListQuery` / `paginated()` from `shared.ts`.
2. Re-export it from `src/index.ts`.
3. Use the schemas in a route file under `apps/api/src/http/routes/`, then run
   `pnpm gen:sdk` from the repo root.

## Notes

- Keep schemas **transport-only**. The domain `core/` defines its own types; the
  `http/` layer maps between them (response validation guarantees the mapping).
- Don't attach `.meta({ id })` unless the spec also hoists named components —
  dangling `$ref`s break SDK generation. Inline schemas generate cleanly.
