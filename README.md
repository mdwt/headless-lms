# Headless LMS

An API-first LMS platform for building learning systems.

- Modern TypeScript: Fastify, Drizzle, Zod, strict ESM
- Composable: swappable adapters for storage and email; integrations plug in
  as folders
- Secure by default: authentication, org-scoped multi-tenancy, encrypted
  credential storage, validated requests and responses
- Headless: build whatever frontend you want on the typed SDK


## Features
Out-of the box, the LMS ships with a backend api, an Admin portal and a student portal. The API and model makes it 
possible to build your own frontend or use the provided ones.

| Feature                 | Description                                                                                                                          |
|-------------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| **Course Builder**      | author structured course content; students work through it activity by activity. Replace the course content UI engine with your own. |
| **Progress tracking**   | per-student, per-activity completion, rolled up into course progress and reporting.                                                  |
| **Entitlements**        | grant and revoke student access to content.                                                                                          |
| **Multi-tenant**        | one deployment serves many orgs; every student, course, and session is org-scoped.                                                   |
| **Admin back-office**   | a Next.js dashboard for courses, students, entitlements, and reporting, built on the public API.                                     |
| **Student portal**      | a Next.js app where students log in and take their courses, built on the SDK.                                                        |
| **Media & file assets** | object storage with presigned upload/download URLs.                                                                                  |
| **Integrations**        | drop a plugin folder into your installation and it's live at startup. Write your own against the public contract.                    |
| **MCP endpoint**        | AI agents connect over OAuth and operate the LMS through the same domain layer as every other client.                                |
| **Typed SDK & OpenAPI** | routes validate requests and responses against shared Zod schemas; the SDK is generated from the resulting spec.                     |
| **Transactional email** | invitation and auth mails, swappable behind an adapter.                                                                              |

## Self-host

```bash
npm create headless-lms
```

Create a standalone installation using the cli. It creates a small project that
depends on `@headless-lms/server`, owns its config and plugins, and deploys
anywhere Node and Postgres run. 

## Under the hood

The backend ships as a library, `@headless-lms/server`: a framework-free
domain core behind a Fastify HTTP layer, persisted with Drizzle/Postgres.

An *installation* composes what it wants with sane defaults. See `apps/api` for an example project.

## Documentation

- [Architecture](docs/architecture.md)  layers, contexts, and how an
  installation composes the server
- [Project structure](docs/project-structure.md)  what each workspace is
- [`packages/server`](packages/server/README.md)  the backend library
- [`packages/create-headless-lms`](packages/create-headless-lms/README.md) 
  the installation scaffolder
- `/docs` on a running API  interactive OpenAPI reference

## Developing this repo

Requires Node ≥22, pnpm 10, and Docker.

```bash
pnpm install
docker compose -f docker/docker-compose.yml up -d   # Postgres (:8005) + MinIO (:8006/:8007)
cp .env.example .env        # set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm db:generate && pnpm db:migrate
pnpm dev                    # api :8000 · admin :8001 · student :8002
```

`pnpm build` / `test` / `lint` / `typecheck` run across all workspaces;
`pnpm gen:sdk` regenerates the OpenAPI spec + SDK (database must be up).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)  setup, the checks a PR must pass,
and where things go in the codebase.

## License

[MIT](LICENSE)
