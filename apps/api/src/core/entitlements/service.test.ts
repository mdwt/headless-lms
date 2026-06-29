import { describe, it, expect, vi } from "vitest";
import { EntitlementsServiceImpl } from "./service.js";
import type { EntitlementsRepository } from "./ports.js";
import type { Entitlement } from "./model.js";

const SAMPLE: Entitlement = {
  id: "e1",
  studentId: "s1",
  studentName: "Bob",
  studentEmail: "bob@example.com",
  courseId: "c1",
  courseTitle: "Intro",
  status: "active",
  progressPercent: 0,
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

describe("EntitlementsService", () => {
  it("lists entitlements via the repository", async () => {
    const repo = fakeRepo();
    const svc = new EntitlementsServiceImpl(repo);
    const page = await svc.list("org-1", { page: 1, pageSize: 20 });
    expect(page.rows).toHaveLength(1);
    expect(repo.list).toHaveBeenCalledWith("org-1", { page: 1, pageSize: 20 });
  });

  it("grants an entitlement (insert) and returns it", async () => {
    const repo = fakeRepo();
    const svc = new EntitlementsServiceImpl(repo);
    const result = await svc.grant("org-1", { studentId: "s1", courseId: "c1", expiresAt: null });
    expect(result.id).toBe("e1");
    expect(repo.insert).toHaveBeenCalledWith("org-1", {
      studentId: "s1",
      courseId: "c1",
      expiresAt: null,
    });
  });

  it("sets status (revoke/reinstate) via the repository", async () => {
    const repo = fakeRepo();
    const svc = new EntitlementsServiceImpl(repo);
    await svc.setStatus("org-1", "e1", "revoked");
    expect(repo.setStatus).toHaveBeenCalledWith("org-1", "e1", "revoked");
  });
});
