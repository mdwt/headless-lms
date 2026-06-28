# @headless-lms/sdk

Fully-typed, **resource-based** TypeScript client for the Headless LMS API,
**generated off the OpenAPI spec** — do not edit `src/generated/` or
`openapi.json` by hand.

## Generating

From the repo root:

```bash
pnpm gen:sdk
```

Two steps run in sequence:

1. `apps/api gen:openapi` — boots the API in-process (no port bound) and writes
   `openapi.json` from the live route schemas. **The database must be running.**
2. `@hey-api/openapi-ts` (`pnpm --filter @headless-lms/sdk gen`) — generates
   `src/generated/` from `openapi.json`.

Regenerate whenever `packages/api-contract` schemas or `apps/api` routes change.
The generated output is committed; a stale diff in review means it wasn't regenerated.

## Usage

```ts
import { configureSdk, Courses } from "@headless-lms/sdk";

// Once at app startup. credentials default to "include" (carries the session cookie).
configureSdk({ baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000" });

const { data, error } = await Courses.listCourses({
  query: { page: 1, pageSize: 20, status: "published", sort: "-enrolledCount" },
});

const course = await Courses.getCourse({ path: { id: "crs_001" } });
```

Methods are grouped into a class per OpenAPI resource tag (`Courses`, …). Each
returns `{ data, error, response }` (it does not throw by default).

## Consuming from a Next.js app

The package ships TypeScript source, so list it in `next.config.ts`:

```ts
transpilePackages: ["@headless-lms/sdk"],
```

`apps/admin/src/lib/api/sdk.ts` is a worked example that adapts these calls to the
dashboard's own param/result shapes and error type.
