import { describe, it, expect, vi } from "vitest";
import { IntegrationsServiceImpl } from "./service.js";
import { createIntegrationsRegistry } from "./registry.js";
import { stripe } from "./stripe/index.js";
import { slack } from "./slack/index.js";
import {
  AlreadyConnectedError,
  InvalidConfigError,
  UnknownIntegrationError,
} from "./model.js";
import type { Connection } from "./model.js";
import type { ConnectionsRepository } from "./ports.js";
import type { CredentialStore, EventBus } from "../shared/ports.js";

const SAMPLE: Connection = {
  id: "con_1",
  integrationId: "stripe",
  config: { mode: "test" },
  active: true,
  credentialRef: "crd_1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const registry = createIntegrationsRegistry([stripe, slack]);

function fakeRepo(over?: Partial<ConnectionsRepository>): ConnectionsRepository {
  return {
    insert: vi.fn().mockImplementation((_org, c) => Promise.resolve(c)),
    findById: vi.fn().mockResolvedValue(SAMPLE),
    findByIntegration: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([SAMPLE]),
    update: vi.fn().mockResolvedValue(SAMPLE),
    delete: vi.fn().mockResolvedValue(true),
    ...over,
  };
}

function fakeCredentials(over?: Partial<CredentialStore>): CredentialStore {
  return {
    store: vi.fn().mockResolvedValue("crd_1"),
    reveal: vi.fn().mockResolvedValue("sk_live_x"),
    update: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

function fakeEvents(): EventBus {
  return { publish: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn() };
}

function build(repo = fakeRepo(), credentials = fakeCredentials(), events = fakeEvents()) {
  const svc = new IntegrationsServiceImpl(
    registry,
    repo,
    credentials,
    events,
    () => "2026-01-02T00:00:00Z",
  );
  return { svc, repo, credentials, events };
}

describe("IntegrationsRegistry", () => {
  it("resolves declared integrations and rejects duplicates", () => {
    expect(registry.get("stripe")?.id).toBe("stripe");
    expect(registry.get("strope")).toBeNull();
    expect(registry.list().map((i) => i.id)).toEqual(["stripe", "slack"]);
    expect(() => createIntegrationsRegistry([stripe, stripe])).toThrow(/duplicate/);
  });
});

describe("IntegrationsService", () => {
  it("connect stores the credential, inserts the connection, emits created", async () => {
    const { svc, repo, credentials, events } = build();
    const conn = await svc.connect("org-1", {
      integrationId: "stripe",
      credential: "sk_live_x",
      config: { mode: "live" },
    });
    expect(credentials.store).toHaveBeenCalledWith("org-1", "sk_live_x");
    expect(conn.credentialRef).toBe("crd_1");
    expect(conn.active).toBe(true);
    expect(repo.insert).toHaveBeenCalled();
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "connection.created", integrationId: "stripe" }),
    );
  });

  it("connect rejects an undeclared integration id", async () => {
    const { svc, credentials } = build();
    await expect(svc.connect("org-1", { integrationId: "strope", credential: "x" })).rejects.toThrow(
      UnknownIntegrationError,
    );
    expect(credentials.store).not.toHaveBeenCalled();
  });

  it("connect rejects config the integration's validator refuses", async () => {
    const { svc, credentials } = build();
    await expect(
      svc.connect("org-1", {
        integrationId: "stripe",
        credential: "x",
        config: { mode: "sandbox" },
      }),
    ).rejects.toThrow(InvalidConfigError);
    expect(credentials.store).not.toHaveBeenCalled();
  });

  it("connect rejects a second connection for the same integration", async () => {
    const { svc, credentials } = build(
      fakeRepo({ findByIntegration: vi.fn().mockResolvedValue(SAMPLE) }),
    );
    await expect(svc.connect("org-1", { integrationId: "stripe", credential: "x" })).rejects.toThrow(
      AlreadyConnectedError,
    );
    expect(credentials.store).not.toHaveBeenCalled();
  });

  it("reconnect replaces the credential in place (same ref), emits updated", async () => {
    const { svc, credentials, events } = build();
    await svc.reconnect("org-1", "con_1", "sk_live_new");
    expect(credentials.update).toHaveBeenCalledWith("org-1", "crd_1", "sk_live_new");
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "connection.updated", changed: "credentials" }),
    );
  });

  it("configure validates the new config against the connection's integration", async () => {
    const { svc } = build();
    await expect(svc.configure("org-1", "con_1", { config: { mode: "nope" } })).rejects.toThrow(
      InvalidConfigError,
    );
  });

  it("configure patches config/active, emits updated", async () => {
    const { svc, repo, events } = build();
    await svc.configure("org-1", "con_1", { active: false });
    expect(repo.update).toHaveBeenCalledWith("org-1", "con_1", {
      active: false,
      updatedAt: "2026-01-02T00:00:00Z",
    });
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "connection.updated", changed: "configuration" }),
    );
  });

  it("disconnect destroys the credential and the connection, emits removed", async () => {
    const { svc, repo, credentials, events } = build();
    const ok = await svc.disconnect("org-1", "con_1");
    expect(ok).toBe(true);
    expect(credentials.destroy).toHaveBeenCalledWith("org-1", "crd_1");
    expect(repo.delete).toHaveBeenCalledWith("org-1", "con_1");
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "connection.removed" }),
    );
  });

  it("reconnect/disconnect return null/false for an unknown connection", async () => {
    const { svc, credentials, events } = build(
      fakeRepo({ findById: vi.fn().mockResolvedValue(null) }),
    );
    expect(await svc.reconnect("org-1", "nope", "x")).toBeNull();
    expect(await svc.disconnect("org-1", "nope")).toBe(false);
    expect(credentials.update).not.toHaveBeenCalled();
    expect(credentials.destroy).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("getByIntegration resolves a consumer's connection", async () => {
    const repo = fakeRepo({ findByIntegration: vi.fn().mockResolvedValue(SAMPLE) });
    const { svc } = build(repo);
    const conn = await svc.getByIntegration("org-1", "stripe");
    expect(conn?.credentialRef).toBe("crd_1");
    expect(repo.findByIntegration).toHaveBeenCalledWith("org-1", "stripe");
  });
});
