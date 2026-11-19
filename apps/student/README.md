# student

Next.js student-facing app: course catalog, dashboard, and course player.

One deployment serves any organization's domain. It asks the API which
organization its domain is, shows that organization's name on its sign-in
pages, and answers 404 on a domain that is no course app's.

The browser talks to the api under `/api` on the domain it is on, which this
app forwards to `API_URL` (`src/app/api/[...path]/route.ts`). Server reads go
through `@headless-lms/sdk`, carrying the visitor's cookie, domain and IP
address; the SDK ships TS source, so it's listed in `transpilePackages`.

```bash
pnpm --filter student dev   # api must be up on :8000
```

Open it on an organization's domain: with the default `PLATFORM_HOST`, the
first organization is at `http://localhost:8002` and a second one with the
slug `acme` at `http://acme.localhost:8002`.
