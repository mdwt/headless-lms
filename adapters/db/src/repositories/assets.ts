import { and, eq, ilike, inArray, lt, sql, asc, desc, type SQL } from "drizzle-orm";
import type { AssetsRepository } from "@headless-lms/core/assets";
import type {
  Asset,
  AssetKind,
  AssetSource,
  AssetStatus,
  AssetsQuery,
  Logger,
  Page,
} from "@headless-lms/core/types";
import { assets } from "../schema/assets.js";
import { noopLogger } from "@headless-lms/core/shared/logger";
import type { DbExecutor } from "../client.js";
import { ConflictError } from "@headless-lms/core/shared/errors";
import { pgErrorFields, translateDbErrors } from "./pg-errors.js";

type Row = typeof assets.$inferSelect;

function toAsset(row: Row): Asset {
  return {
    orgId: row.orgId,
    id: row.id,
    key: row.key,
    kind: row.kind as AssetKind,
    source: row.source as AssetSource,
    filename: row.filename,
    contentType: row.contentType,
    size: row.size,
    status: row.status as AssetStatus,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const SORT_COLUMNS = {
  filename: assets.filename,
  size: assets.size,
  createdAt: assets.createdAt,
} as const;

function referenced(orgId: SQL, assetId: SQL): SQL {
  return sql`(
    exists (select 1 from user_profiles p where p.image_asset_org_id = ${orgId} and p.image_asset_id = ${assetId})
    or exists (select 1 from posts p where p.org_id = ${orgId} and p.cover_asset_id = ${assetId})
    or exists (select 1 from message_attachments ma where ma.org_id = ${orgId} and ma.asset_id = ${assetId})
    or exists (select 1 from activity_assets aa where aa.org_id = ${orgId} and aa.asset_id = ${assetId})
    or exists (select 1 from download_assets da where da.org_id = ${orgId} and da.asset_id = ${assetId})
    or exists (select 1 from courses c where c.org_id = ${orgId} and c.thumbnail_asset_id = ${assetId})
    or exists (select 1 from downloads d where d.org_id = ${orgId} and d.thumbnail_asset_id = ${assetId})
    or exists (select 1 from communities c where c.org_id = ${orgId} and c.thumbnail_asset_id = ${assetId})
  )`;
}

function unreferencedMemberUploads(orgId: string, before: Date): SQL | undefined {
  return and(
    eq(assets.orgId, orgId),
    eq(assets.source, "member"),
    lt(assets.createdAt, before),
    sql`not ${referenced(sql`${assets.orgId}`, sql`${assets.id}`)}`,
  );
}

export class DrizzleAssetsRepository implements AssetsRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly logger: Logger = noopLogger,
  ) {}

  async insert(orgId: string, asset: Asset): Promise<Asset> {
    if (asset.orgId !== orgId) {
      throw new Error("asset org mismatch");
    }
    const [row] = await this.db
      .insert(assets)
      .values({
        id: asset.id,
        orgId: asset.orgId,
        key: asset.key,
        kind: asset.kind,
        source: asset.source,
        filename: asset.filename,
        contentType: asset.contentType,
        size: asset.size,
        status: asset.status,
        uploadedBy: asset.uploadedBy,
        createdAt: new Date(asset.createdAt),
      })
      .returning();
    if (!row) {
      throw new Error("failed to insert asset");
    }
    return toAsset(row);
  }

  async list(orgId: string, query: AssetsQuery): Promise<Page<Asset>> {
    const filters: (SQL | undefined)[] = [eq(assets.orgId, orgId)];
    if (query.kind) {
      filters.push(eq(assets.kind, query.kind));
    }
    if (query.source) {
      filters.push(eq(assets.source, query.source));
    }
    const q = query.search?.trim();
    if (q) {
      filters.push(ilike(assets.filename, `%${q}%`));
    }
    const where = and(...filters);

    const orderBy = (() => {
      if (!query.sort) {
        return desc(assets.createdAt);
      }
      const descending = query.sort.startsWith("-");
      const field = descending ? query.sort.slice(1) : query.sort;
      const col = SORT_COLUMNS[field as keyof typeof SORT_COLUMNS] ?? assets.createdAt;
      return descending ? desc(col) : asc(col);
    })();

    const offset = (query.page - 1) * query.pageSize;
    const rows = await this.db
      .select()
      .from(assets)
      .where(where)
      .orderBy(orderBy)
      .limit(query.pageSize)
      .offset(offset);

    const counted = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(assets)
      .where(where);

    return {
      rows: rows.map(toAsset),
      total: counted[0]?.value ?? 0,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findById(orgId: string, id: string): Promise<Asset | null> {
    const [row] = await this.db
      .select()
      .from(assets)
      .where(and(eq(assets.orgId, orgId), eq(assets.id, id)))
      .limit(1);
    return row ? toAsset(row) : null;
  }

  async findByIds(orgId: string, ids: string[]): Promise<Asset[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(assets)
      .where(and(eq(assets.orgId, orgId), inArray(assets.id, ids)));
    return rows.map(toAsset);
  }

  async markReady(
    orgId: string,
    id: string,
    patch: Pick<Asset, "key" | "kind" | "size" | "contentType">,
  ): Promise<Asset | null> {
    const [row] = await this.db
      .update(assets)
      .set({
        key: patch.key,
        kind: patch.kind,
        size: patch.size,
        contentType: patch.contentType,
        status: "ready",
      })
      .where(and(eq(assets.orgId, orgId), eq(assets.id, id), eq(assets.status, "pending")))
      .returning();
    return row ? toAsset(row) : null;
  }

  async delete(orgId: string, id: string): Promise<boolean> {
    try {
      const deleted = await this.db
        .delete(assets)
        .where(and(eq(assets.orgId, orgId), eq(assets.id, id)))
        .returning({ id: assets.id });
      return deleted.length > 0;
    } catch (err) {
      if (pgErrorFields(err)?.code === "23503") {
        throw Object.assign(new ConflictError("This file is still in use"), { cause: err });
      }
      throw err;
    }
  }

  async hasUnreferencedMemberUploads(orgId: string, before: Date): Promise<boolean> {
    const [row] = await this.db
      .select({ id: assets.id })
      .from(assets)
      .where(unreferencedMemberUploads(orgId, before))
      .limit(1);
    return row !== undefined;
  }

  async listUnreferencedMemberUploads(orgId: string, before: Date): Promise<Asset[]> {
    const rows = await this.db
      .select()
      .from(assets)
      .where(unreferencedMemberUploads(orgId, before))
      .orderBy(asc(assets.createdAt));
    return rows.map(toAsset);
  }

  async heldKeys(orgId: string, keys: string[]): Promise<string[]> {
    if (keys.length === 0) {
      return [];
    }
    const rows = await this.db
      .select({ key: assets.key })
      .from(assets)
      .where(and(eq(assets.orgId, orgId), inArray(assets.key, keys)));
    return rows.map((r) => r.key);
  }
}
translateDbErrors(DrizzleAssetsRepository);
