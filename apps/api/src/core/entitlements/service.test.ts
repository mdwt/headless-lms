import { describe, it, expect, vi } from "vitest";
import { EntitlementsServiceImpl } from "./service.js";
import type { EntitlementsRepository } from "./ports.js";
import type { Entitlement } from "./model.js";
import type { EventBus } from "../shared/ports.js";

const SAMPLE: Entitlement = {
  id: "e1",
  studentId: "s1",
  firstName: "Bob",
  lastName: "Smith",
  studentEmail: "bob@example.com",
  courseId: "c1",
  courseTitle: "Intro",
  status: "active",
  grantedAt: "2026-01-01T00:00:00Z",
  expiresAt: null,
  source: "manual",
};

function fakeRepo(over?: Partial<EntitlementsRepository>): EntitlementsRepository {
  return {
    list: vi.fn().mockResolvedValue({ rows: [SAMPLE], total: 1, page: 1, pageSize: 20 }),
    insert: vi.fn().mockResolvedValue(SAMPLE),
    setStatus: vi.fn().mockResolvedValue(SAMPLE),
    ...over,
  };
}

function fakeEvents(): EventBus {
  return { publish: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn() };
}

describe("EntitlementsService", () => {
  it("lists entitlements via the repository without publishing", async () => {
    const repo = fakeRepo();
    const events = fakeEvents();
    const svc = new EntitlementsServiceImpl(repo, events);
    const page = await svc.list("org-1", { page: 1, pageSize: 20 });
    expect(page.rows).toHaveLength(1);
    expect(repo.list).toHaveBeenCalledWith("org-1", { page: 1, pageSize: 20 });
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("grants an entitlement (insert) and returns it", async () => {
    const repo = fakeRepo();
    const svc = new EntitlementsServiceImpl(repo, fakeEvents());
    const result = await svc.grant("org-1", { studentId: "s1", courseId: "c1", expiresAt: null });
    expect(result.id).toBe("e1");
    expect(repo.insert).toHaveBeenCalledWith("org-1", {
      studentId: "s1",
      courseId: "c1",
      expiresAt: null,
    });
  });

  it("publishes entitlement.granted with the org and full snapshot", async () => {
    const events = fakeEvents();
    const svc = new EntitlementsServiceImpl(fakeRepo(), events);
    await svc.grant("org-1", { studentId: "s1", courseId: "c1", expiresAt: null });
    expect(events.publish).toHaveBeenCalledWith({
      type: "entitlement.granted",
      orgId: "org-1",
      entitlement: SAMPLE,
    });
  });

  it("sets status (revoke/reinstate) via the repository", async () => {
    const repo = fakeRepo();
    const svc = new EntitlementsServiceImpl(repo, fakeEvents());
    await svc.setStatus("org-1", "e1", "revoked");
    expect(repo.setStatus).toHaveBeenCalledWith("org-1", "e1", "revoked");
  });

  it("publishes entitlement.revoked on revoke", async () => {
    const events = fakeEvents();
    const svc = new EntitlementsServiceImpl(fakeRepo(), events);
    await svc.setStatus("org-1", "e1", "revoked");
    expect(events.publish).toHaveBeenCalledWith({
      type: "entitlement.revoked",
      orgId: "org-1",
      entitlement: SAMPLE,
    });
  });

  it("publishes entitlement.reinstated on reactivation", async () => {
    const events = fakeEvents();
    const svc = new EntitlementsServiceImpl(fakeRepo(), events);
    await svc.setStatus("org-1", "e1", "active");
    expect(events.publish).toHaveBeenCalledWith({
      type: "entitlement.reinstated",
      orgId: "org-1",
      entitlement: SAMPLE,
    });
  });

  it("publishes nothing when setStatus finds no entitlement", async () => {
    const events = fakeEvents();
    const repo = fakeRepo({ setStatus: vi.fn().mockResolvedValue(null) });
    const svc = new EntitlementsServiceImpl(repo, events);
    const result = await svc.setStatus("org-1", "missing", "revoked");
    expect(result).toBeNull();
    expect(events.publish).not.toHaveBeenCalled();
  });
});
