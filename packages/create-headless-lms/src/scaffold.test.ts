import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffold } from "./scaffold.js";
import { defaultAnswers } from "./answers.js";

let dirs: string[] = [];
async function scratch(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "chl-test-"));
  dirs.push(d);
  return d;
}
afterEach(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  dirs = [];
});

describe("scaffold", () => {
  it("writes the full installation with defaults", async () => {
    const target = join(await scratch(), "my-lms");
    await scaffold(defaultAnswers("my-lms"), target);
    for (const f of [
      "package.json",
      "tsconfig.json",
      "tsdown.config.ts",
      ".gitignore",
      ".env",
      ".env.example",
      "docker-compose.yml",
      "README.md",
      "src/main.ts",
      "src/config.ts",
      "src/plugins/README.md",
    ]) {
      expect(existsSync(join(target, f)), f).toBe(true);
    }
  });

  it("generates real secrets in .env and blanks them in .env.example", async () => {
    const target = join(await scratch(), "my-lms");
    await scaffold(defaultAnswers("my-lms"), target);
    const env = await readFile(join(target, ".env"), "utf8");
    const example = await readFile(join(target, ".env.example"), "utf8");
    const secret = env.match(/^BETTER_AUTH_SECRET=(.+)$/m)?.[1] ?? "";
    const storeKey = env.match(/^CREDENTIAL_STORE_KEY=(.+)$/m)?.[1] ?? "";
    // 32 random bytes, base64 → 44 chars ending in "="
    expect(secret).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(storeKey).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(secret).not.toBe(storeKey);
    expect(example).toMatch(/^BETTER_AUTH_SECRET=$/m);
    expect(example).toMatch(/^CREDENTIAL_STORE_KEY=$/m);
  });

  it("docker db answer produces matching DATABASE_URL and compose service", async () => {
    const target = join(await scratch(), "my-lms");
    await scaffold(defaultAnswers("my-lms"), target);
    const env = await readFile(join(target, ".env"), "utf8");
    expect(env).toContain("DATABASE_URL=postgres://postgres:postgres@localhost:8005/my_lms");
    const compose = await readFile(join(target, "docker-compose.yml"), "utf8");
    expect(compose).toContain("postgres:17");
    expect(compose).toContain("minio/minio");
  });

  it("url db + skip storage: no compose file, no STORAGE_ vars", async () => {
    const target = join(await scratch(), "my-lms");
    const answers = {
      ...defaultAnswers("my-lms"),
      db: { mode: "url" as const, url: "postgres://u:p@db.example.com:5432/lms" },
      storage: { mode: "skip" as const },
    };
    await scaffold(answers, target);
    expect(existsSync(join(target, "docker-compose.yml"))).toBe(false);
    const env = await readFile(join(target, ".env"), "utf8");
    expect(env).toContain("DATABASE_URL=postgres://u:p@db.example.com:5432/lms");
    expect(env).not.toContain("STORAGE_ENDPOINT");
  });

  it("s3 storage: .env carries real credentials, .env.example blanks them", async () => {
    const target = join(await scratch(), "my-lms");
    const answers = {
      ...defaultAnswers("my-lms"),
      storage: {
        mode: "s3" as const,
        endPoint: "s3.amazonaws.com",
        port: 443,
        useSSL: true,
        accessKey: "AKIAREALLOOKINGACCESSKEY",
        secretKey: "wJalrXUtnFEMIrealLookingSecretKeyEXAMPLE",
        region: "us-east-1",
        bucket: "my-lms",
      },
    };
    await scaffold(answers, target);
    const env = await readFile(join(target, ".env"), "utf8");
    const example = await readFile(join(target, ".env.example"), "utf8");
    expect(env).toContain("STORAGE_ACCESS_KEY=AKIAREALLOOKINGACCESSKEY");
    expect(env).toContain("STORAGE_SECRET_KEY=wJalrXUtnFEMIrealLookingSecretKeyEXAMPLE");
    expect(example).toMatch(/^STORAGE_ACCESS_KEY=$/m);
    expect(example).toMatch(/^STORAGE_SECRET_KEY=$/m);
    expect(example).not.toContain("AKIAREALLOOKINGACCESSKEY");
    expect(example).not.toContain("wJalrXUtnFEMIrealLookingSecretKeyEXAMPLE");
  });

  it("refuses a non-empty target directory", async () => {
    const target = join(await scratch(), "occupied");
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "keep.txt"), "x");
    await expect(scaffold(defaultAnswers("occupied"), target)).rejects.toThrow(/not empty/);
    expect(existsSync(join(target, "keep.txt"))).toBe(true);
  });
});
