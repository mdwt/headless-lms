import { describe, it, expect, vi } from "vitest";
import { EntitlementsServiceImpl } from "./service.js";
import type { EntitlementsRepository, EntitlementsUnitOfWork } from "./ports.js";
import type { Entitlement } from "./model.js";
import type { NewDomainEvent, OutboxAppender } from "../shared/ports.js";

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

/** Pass-through unit of work: runs the callback with the fake repo as the
 *  tx-bound scope plus a capturing outbox appender. */
function fakeUow(repo: EntitlementsRepository) {
  const appended: NewDomainEvent[] = [];
  const append = vi.fn(async (events: NewDomainEvent[]) => {
    appended.push(...events);
  });
  const outbox: OutboxAppender = { append };
  const uow: EntitlementsUnitOfWork = {
    run: (fn) => fn({ entitlements: repo, outbox }),
  };
  return { uow, append, appended };
}

function build(repo = fakeRepo()) {
  const { uow, append, appended } = fakeUow(repo);
  const svc = new EntitlementsServiceImpl(repo, uow);
  return { svc, repo, append, appended };
}

describe("EntitlementsService", () => {
  it("lists entitlements via the read repository without appending events", async () => {
    const { svc, repo, append } = build();
    const page = await svc.list("org-1", { page: 1, pageSize: 20 });
    expect(page.rows).toHaveLength(1);
    expect(repo.list).toHaveBeenCalledWith("org-1", { page: 1, pageSize: 20 });
    expect(append).not.toHaveBeenCalled();
  });

  it("grants an entitlement (insert) and returns it", async () => {
    const { svc, repo } = build();
    const result = await svc.grant("org-1", { studentId: "s1", courseId: "c1", expiresAt: null });
    expect(result.id).toBe("e1");
    expect(repo.insert).toHaveBeenCalledWith("org-1", {
      studentId: "s1",
      courseId: "c1",
      expiresAt: null,
    });
  });

  it("appends enrollment.created (org + full snapshot) inside the unit of work", async () => {
    const { svc, appended } = build();
    await svc.grant("org-1", { studentId: "s1", courseId: "c1", expiresAt: null });
    expect(appended).toEqual([{ type: "enrollment.created", orgId: "org-1", enrollment: SAMPLE }]);
  });

  it("sets status (revoke/reactivate) via the tx-bound repository", async () => {
    const { svc, repo } = build();
    await svc.setStatus("org-1", "e1", "revoked");
    expect(repo.setStatus).toHaveBeenCalledWith("org-1", "e1", "revoked");
  });

  it("appends enrollment.deleted on revoke", async () => {
    const { svc, appended } = build();
    await svc.setStatus("org-1", "e1", "revoked");
    expect(appended).toEqual([{ type: "enrollment.deleted", orgId: "org-1", enrollment: SAMPLE }]);
  });

  it("appends enrollment.updated on reactivation", async () => {
    const { svc, appended } = build();
    await svc.setStatus("org-1", "e1", "active");
    expect(appended).toEqual([{ type: "enrollment.updated", orgId: "org-1", enrollment: SAMPLE }]);
  });

  it("appends nothing when setStatus finds no entitlement", async () => {
    const { svc, append } = build(fakeRepo({ setStatus: vi.fn().mockResolvedValue(null) }));
    const result = await svc.setStatus("org-1", "missing", "revoked");
    expect(result).toBeNull();
    expect(append).not.toHaveBeenCalled();
  });

  it("does not append when the write fails — the error propagates out of run", async () => {
    const { svc, append } = build(fakeRepo({ insert: vi.fn().mockRejectedValue(new Error("boom")) }));
    await expect(
      svc.grant("org-1", { studentId: "s1", courseId: "c1", expiresAt: null }),
    ).rejects.toThrow("boom");
    expect(append).not.toHaveBeenCalled();
  });
});
