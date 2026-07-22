# @headless-lms/cli

The `headless-lms` bin: a thin CLI over the operational functions
`@headless-lms/server` exports. Reads `.env` from the cwd if present.

```bash
headless-lms migrate   # apply the server's bundled Drizzle migrations
headless-lms --help
```

Installations get it as a dependency (the `create-headless-lms` scaffold wires
`pnpm migrate` to it). In this repo, `apps/api` runs the same entry via tsx:
`pnpm --filter @headless-lms/api db:migrate`.

## Structure

```
src/
  index.ts       bin entry: .env, dispatch, exit code — no logic
  main.ts        dispatcher: usage/help/version, error → exit 1 (testable, no process.exit)
  command.ts     the Command interface
  commands/      one module per command + the explicit registry (index.ts)
```

**Adding a command:** create `src/commands/<name>.ts` exporting a `Command`
(`{ name, description, run(args) }`), register it in `src/commands/index.ts`.
Throw from `run` to fail — the dispatcher prints the message and exits 1.
