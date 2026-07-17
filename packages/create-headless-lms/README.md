# create-headless-lms

Scaffolds a standalone LMS installation: `npm create headless-lms` (or
`create-headless-lms <name> --yes` for defaults). An interactive wizard asks
for name, ports, database and storage settings, renders `templates/` into a
new project depending on `@headless-lms/server` + `@headless-lms/cli`, then
offers to install and migrate.

The generated installation owns only its config, entry point, and integration
plugins — the backend itself is the server library.

## Develop

```bash
pnpm --filter create-headless-lms build
pnpm --filter create-headless-lms test
bash scripts/e2e.sh   # scaffold → install packed workspace tarballs → migrate → boot
                      # (needs docker Postgres from docker/docker-compose.yml)
```
