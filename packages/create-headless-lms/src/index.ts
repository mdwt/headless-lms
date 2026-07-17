#!/usr/bin/env node
// npm create headless-lms → this. Walks the prompts (or --yes for defaults),
// scaffolds the installation, then offers install + migrate.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import { parseArgs, validateName } from "./args.js";
import { defaultAnswers, type Answers, type StorageAnswer } from "./answers.js";
import { scaffold } from "./scaffold.js";

const args = parseArgs(process.argv.slice(2));

function bail(message = "Cancelled."): never {
  p.cancel(message);
  process.exit(1);
}
/** Unwrap a clack result, exiting cleanly on ctrl-c. */
function got<T>(value: T | symbol): T {
  if (p.isCancel(value)) bail();
  return value as T;
}

p.intro("create-headless-lms");

let name = args.name;
if (!name) {
  if (args.yes) bail("--yes needs a project name: create-headless-lms <name> --yes");
  name = got(
    await p.text({
      message: "Project name",
      placeholder: "my-lms",
      validate: (v) => validateName(v ?? ""),
    }),
  );
}
const nameError = validateName(name);
if (nameError) bail(nameError);

let answers: Answers = defaultAnswers(name);

if (!args.yes) {
  const dbMode = got(
    await p.select({
      message: "Database",
      options: [
        { value: "docker", label: "Postgres via docker-compose (recommended)" },
        { value: "url", label: "I have a connection string" },
      ],
    }),
  );
  const db =
    dbMode === "url"
      ? { mode: "url" as const, url: got(await p.text({ message: "DATABASE_URL", placeholder: "postgres://user:pass@host:5432/db" })) }
      : { mode: "docker" as const };

  const storageMode = got(
    await p.select({
      message: "File storage",
      options: [
        { value: "minio", label: "Bundled MinIO via docker-compose (recommended)" },
        { value: "s3", label: "Existing S3-compatible storage" },
        { value: "skip", label: "Skip for now" },
      ],
    }),
  );
  let storage: StorageAnswer = { mode: "minio" };
  if (storageMode === "skip") storage = { mode: "skip" };
  if (storageMode === "s3") {
    storage = {
      mode: "s3",
      endPoint: got(await p.text({ message: "Endpoint host", placeholder: "s3.amazonaws.com" })),
      port: Number(got(await p.text({ message: "Port", initialValue: "443" }))),
      useSSL: got(await p.confirm({ message: "Use SSL?", initialValue: true })),
      accessKey: got(await p.text({ message: "Access key" })),
      secretKey: got(await p.text({ message: "Secret key" })),
      region: got(await p.text({ message: "Region", initialValue: "us-east-1" })),
      bucket: got(await p.text({ message: "Bucket", initialValue: name })),
    };
  }

  const port = Number(got(await p.text({ message: "API port", initialValue: "8000" })));
  const clientOrigins = got(
    await p.text({
      message: "Client origins (comma-separated, for CORS + auth)",
      initialValue: "http://localhost:8001,http://localhost:8002",
    }),
  );

  answers = { name, db, storage, port, clientOrigins };
}

const targetDir = resolve(process.cwd(), name);
const s = p.spinner();
s.start(`Scaffolding ${name}`);
try {
  await scaffold(answers, targetDir);
  s.stop(`Created ${name}/`);
} catch (err) {
  s.stop("Scaffold failed");
  bail(err instanceof Error ? err.message : String(err));
}

const run = (cmd: string, argv: string[]) =>
  spawnSync(cmd, argv, { cwd: targetDir, stdio: "inherit" });

if (!args.yes && got(await p.confirm({ message: "Run pnpm install now?", initialValue: true }))) {
  run("pnpm", ["install"]);
  if (got(await p.confirm({ message: "Run migrations now? (database must be reachable)", initialValue: false }))) {
    run("pnpm", ["migrate"]);
  }
}

p.note(
  [
    `cd ${name}`,
    ...(answers.db.mode === "docker" || answers.storage.mode === "minio" ? ["docker compose up -d"] : []),
    "pnpm install        # if you skipped it",
    "pnpm migrate",
    "pnpm dev",
  ].join("\n"),
  "Next steps",
);
p.outro(`API will listen on http://localhost:${answers.port} — docs at /docs`);
