import { describe, it, expect, vi } from "vitest";
import { AssetsServiceImpl } from "./service.js";
import type { AssetsRepository } from "./ports.js";
import type { Asset } from "./model.js";
import type { ObjectStorage } from "../shared/ports.js";
import { createCapturingLogger } from "../shared/logger.js";

function fakeStorage(): ObjectStorage {
  return {
    presignUpload: vi.fn(async ({ key }) => ({
      url: `https://storage/${key}`,
      method: "PUT" as const,
      key,
      expiresInSeconds: 300,
      headers: {},
    })),
    presignDownload: vi.fn(async () => "https://storage/download"),
    stat: vi.fn(async (key: string) => ({ key, size: 42, contentType: "video/mp4" })),
    remove: vi.fn(async () => {}),
  };
}

function fakeRepo() {
  const assets: Asset[] = [];
  const repo: AssetsRepository = {
    async insert(_orgId, asset) {
      assets.push(asset);
      return asset;
    },
    async list() {
      return { rows: assets, total: assets.length, page: 1, pageSize: 20 };
    },
    async findById(_orgId, id) {
      return assets.find((a) => a.id === id) ?? null;
    },
    async update(id, patch) {
      const asset = assets.find((a) => a.id === id);
      if (!asset) return null;
      Object.assign(asset, patch);
      return asset;
    },
    async delete(id) {
      const i = assets.findIndex((a) => a.id === id);
      if (i < 0) return false;
      assets.splice(i, 1);
      return true;
    },
  };
  return { repo, assets };
}

describe("AssetsService logging", () => {
  it("logs upload request, confirm, and removal", async () => {
    const { logger, entries } = createCapturingLogger();
    const { repo } = fakeRepo();
    const svc = new AssetsServiceImpl(fakeStorage(), repo, () => "2026-01-01T00:00:00Z", logger);

    const ticket = await svc.requestUpload("org-1", {
      kind: "video",
      filename: "a.mp4",
      contentType: "video/mp4",
      uploadedBy: "u1",
    });
    await svc.confirm("org-1", ticket.asset.id);
    await svc.remove("org-1", ticket.asset.id);

    expect(entries.filter((e) => e.level === "info").map((e) => e.msg)).toEqual([
      "asset upload requested",
      "asset confirmed",
      "asset removed",
    ]);
    expect(entries[0]?.meta).toMatchObject({ orgId: "org-1", assetId: ticket.asset.id, kind: "video" });
  });
});
