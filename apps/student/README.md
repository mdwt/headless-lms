# student

Next.js student-facing app: course catalog, dashboard, and course player.

Talks to the api exclusively through `@headless-lms/sdk` (configured once via
`configureSdk({ baseUrl })`); the SDK ships TS source, so it's listed in
`transpilePackages`.

```bash
pnpm --filter student dev   # http://localhost:8002 (api must be up on :8000)
```
