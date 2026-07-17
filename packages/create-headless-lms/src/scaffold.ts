// Renders the bundled templates into a new installation directory.
// Pure with respect to prompts: everything variable comes in via Answers.
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { type Answers, dbName } from "./answers.js";

/** templates/ sits at the package root: ../templates from src/ AND dist/. */
const TEMPLATES = fileURLToPath(new URL("../templates/", import.meta.url));

function render(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = vars[key];
    if (v === undefined) throw new Error(`template variable {{${key}}} has no value`);
    return v;
  });
}

const POSTGRES_SERVICE = `  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: {{DB_NAME}}
    ports:
      - "8005:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data`;

const MINIO_SERVICE = `  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "8006:9000"
      - "8007:9001"
    volumes:
      - miniodata:/data`;

const MINIO_ENV = `
STORAGE_ENDPOINT=localhost
STORAGE_PORT=8006
STORAGE_USE_SSL=false
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_REGION=us-east-1
STORAGE_BUCKET={{DB_NAME}}
`;

function s3Env(s: Extract<Answers["storage"], { mode: "s3" }>): string {
  return `
STORAGE_ENDPOINT=${s.endPoint}
STORAGE_PORT=${s.port}
STORAGE_USE_SSL=${s.useSSL}
STORAGE_ACCESS_KEY=${s.accessKey}
STORAGE_SECRET_KEY=${s.secretKey}
STORAGE_REGION=${s.region}
STORAGE_BUCKET=${s.bucket}
`;
}

export async function scaffold(answers: Answers, targetDir: string): Promise<string[]> {
  try {
    const existing = await readdir(targetDir);
    if (existing.length > 0) throw new Error(`target directory ${targetDir} is not empty`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  const written: string[] = [];
  try {
    const name = dbName(answers.name);
    const databaseUrl =
      answers.db.mode === "docker"
        ? `postgres://postgres:postgres@localhost:8005/${name}`
        : answers.db.url;
    const storageEnv =
      answers.storage.mode === "minio"
        ? render(MINIO_ENV, { DB_NAME: name })
        : answers.storage.mode === "s3"
          ? s3Env(answers.storage)
          : "";

    const vars: Record<string, string> = {
      NAME: answers.name,
      DB_NAME: name,
      PORT: String(answers.port),
      CLIENT_ORIGINS: answers.clientOrigins,
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_SECRET: randomBytes(32).toString("base64"),
      CREDENTIAL_STORE_KEY: randomBytes(32).toString("base64"),
      STORAGE_ENV: storageEnv,
    };

    await mkdir(join(targetDir, "src", "plugins"), { recursive: true });

    const write = async (rel: string, content: string) => {
      await writeFile(join(targetDir, rel), content);
      written.push(rel);
    };
    const fromTemplate = async (tmpl: string, rel: string, extra?: Record<string, string>) =>
      write(rel, render(await readFile(join(TEMPLATES, tmpl), "utf8"), { ...vars, ...extra }));

    await fromTemplate("package.json.tmpl", "package.json");
    await fromTemplate("README.md", "README.md");
    await fromTemplate("env.tmpl", ".env");
    await fromTemplate("env.tmpl", ".env.example", {
      BETTER_AUTH_SECRET: "",
      CREDENTIAL_STORE_KEY: "",
      DATABASE_URL: answers.db.mode === "docker" ? databaseUrl : "",
    });
    await cp(join(TEMPLATES, "tsconfig.json"), join(targetDir, "tsconfig.json"));
    await cp(join(TEMPLATES, "tsdown.config.ts"), join(targetDir, "tsdown.config.ts"));
    await cp(join(TEMPLATES, "gitignore"), join(targetDir, ".gitignore"));
    await cp(join(TEMPLATES, "src/main.ts"), join(targetDir, "src/main.ts"));
    await cp(join(TEMPLATES, "src/config.ts"), join(targetDir, "src/config.ts"));
    await cp(join(TEMPLATES, "src/plugins/README.md"), join(targetDir, "src/plugins/README.md"));
    written.push("tsconfig.json", "tsdown.config.ts", ".gitignore", "src/main.ts", "src/config.ts", "src/plugins/README.md");

    const services: string[] = [];
    const volumes: string[] = [];
    if (answers.db.mode === "docker") {
      services.push(render(POSTGRES_SERVICE, { DB_NAME: name }));
      volumes.push("  pgdata:");
    }
    if (answers.storage.mode === "minio") {
      services.push(MINIO_SERVICE);
      volumes.push("  miniodata:");
    }
    if (services.length > 0) {
      const compose = `name: ${answers.name}\nservices:\n${services.join("\n")}\nvolumes:\n${volumes.join("\n")}\n`;
      await write("docker-compose.yml", compose);
    }

    return written;
  } catch (err) {
    // Leave no half-written project behind.
    await rm(targetDir, { recursive: true, force: true });
    throw err;
  }
}
