import { describe, expect, it } from "vitest";
import { getSchema } from "better-auth/db";
import { getTableColumns } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as authSchema from "@headless-lms/adapter-db/schema/better-auth";
import { buildAuthOptions } from "./better-auth.js";
import type { CreateAuthOptions } from "./types.js";

const noop = async () => undefined;
const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => logger,
};

const options: CreateAuthOptions = {
  db: {} as NodePgDatabase,
  baseUrl: "http://localhost:8100",
  secret: "a".repeat(32),
  trustedOrigins: [],
  logger: logger as unknown as CreateAuthOptions["logger"],
  hooks: {
    beforeUserCreate: noop,
    sendResetPassword: noop,
    onPasswordReset: noop,
    sendMagicLink: noop,
  } as unknown as CreateAuthOptions["hooks"],
  mcp: {
    oauthEnabled: true,
    resource: "http://localhost:8100/mcp",
    loginPage: "http://localhost:8101/login",
    consentPage: "http://localhost:8101/oauth/consent",
    orgPickerPage: "http://localhost:8101/onboarding/select-organization",
  },
};

describe("better-auth drizzle schema", () => {
  const models = getSchema(buildAuthOptions(options));

  for (const [model, definition] of Object.entries(models)) {
    it(`maps every ${model} field`, () => {
      const table = (authSchema as Record<string, PgTable | undefined>)[model];
      expect(table, `no export named ${model} in schema/better-auth.ts`).toBeDefined();
      const columns = getTableColumns(table as PgTable);
      for (const field of Object.keys(definition.fields)) {
        expect(columns, `${model}.${field}`).toHaveProperty(field);
      }
    });
  }
});

describe("mcp oauth off", () => {
  const off: CreateAuthOptions = {
    ...options,
    baseUrl: "http://api.internal:8000",
    mcp: {
      ...options.mcp,
      oauthEnabled: false,
      resource: "http://api.internal:8000/mcp",
    },
  };

  it("builds options for a plain-http public url without the oauth plugins", () => {
    const ids = (built: ReturnType<typeof buildAuthOptions>) => built.plugins.map((p) => p.id);
    const enabled = ids(buildAuthOptions(options));
    const disabled = ids(buildAuthOptions(off));
    const oauthOnly = enabled.filter((id) => !disabled.includes(id));
    expect(oauthOnly.length).toBeGreaterThan(0);
    expect(disabled).toEqual(enabled.filter((id) => !oauthOnly.includes(id)));
    expect(getSchema(buildAuthOptions(off))).not.toHaveProperty("oauthClient");
  });

  it("refuses to build the oauth plugins for that url", () => {
    expect(() => buildAuthOptions({ ...off, mcp: { ...off.mcp, oauthEnabled: true } })).toThrow(
      /HTTPS/,
    );
  });
});
