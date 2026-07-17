# admin

Next.js back-office dashboard for instructors/admins: courses, students,
enrollments, organization members, and the overview dashboard.

Talks to the api exclusively through `@headless-lms/sdk` (configured once via
`configureSdk({ baseUrl })`); the SDK ships TS source, so it's listed in
`transpilePackages`.

```bash
pnpm --filter admin dev   # http://localhost:8001 (api must be up on :8000)
```
