import { describe, it, expect, vi } from "vitest";
import { IntegrationsServiceImpl } from "./service.js";
import { AlreadyConnectedError } from "./model.js";
import type { Connection } from "./model.js";
import type { ConnectionsRepository } from "./ports.js";
import type { CredentialStore, EventBus } from "../shared/ports.js";

const SAMPLE: Connection = {
  id: "con_1",
  service: "stripe",
  config: { mode: "test" },
  active: true,
  credentialRef: "crd_1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function fakeRepo(over?: Partial<ConnectionsRepository>): ConnectionsRepository {
  return {
    insert: vi.fn().mockImplementation((_org, c) => Promise.resolve(c)),
    findById: vi.fn().mockResolvedValue(SAMPLE),
    findByService: vi.fn().mockResolvedValue(null),
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
  const svc = new IntegrationsServiceImpl(repo, credentials, events, () => "2026-01-02T00:00:00Z");
  return { svc, repo, credentials, events };
}

describe("IntegrationsService", () => {
  it("connect stores the credential, inserts the connection, emits created", async () => {
    const { svc, repo, credentials, events } = build();
    const conn = await svc.connect("org-1", { service: "stripe", credential: "sk_live_x" });
    expect(credentials.store).toHaveBeenCalledWith("org-1", "sk_live_x");
    expect(conn.credentialRef).toBe("crd_1");
    expect(conn.active).toBe(true);
    expect(repo.insert).toHaveBeenCalled();
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "connection.created", service: "stripe" }),
    );
  });

  it("connect rejects a second connection for the same service", async () => {
    const { svc, credentials } = build(fakeRepo({ findByService: vi.fn().mockResolvedValue(SAMPLE) }));
    await expect(svc.connect("org-1", { service: "stripe", credential: "x" })).rejects.toThrow(
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

  it("getByService resolves a consumer's connection", async () => {
    const repo = fakeRepo({ findByService: vi.fn().mockResolvedValue(SAMPLE) });
    const { svc } = build(repo);
    const conn = await svc.getByService("org-1", "stripe");
    expect(conn?.credentialRef).toBe("crd_1");
    expect(repo.findByService).toHaveBeenCalledWith("org-1", "stripe");
  });
});
