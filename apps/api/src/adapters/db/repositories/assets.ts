// assets — Drizzle repository (implements the core outbound port).
import { and, eq, ilike, sql, asc, desc, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { AssetsRepository } from "../../../core/assets/ports.js";
import type {
  Asset,
  AssetKind,
  AssetStatus,
  AssetsQuery,
  Page,
} from "../../../core/assets/model.js";
import { assets } from "../schema/assets.js";

type Row = typeof assets.$inferSelect;

function toAsset(row: Row): Asset {
  return {
    id: row.id,
    key: row.key,
    kind: row.kind as AssetKind,
    filename: row.filename,
    contentType: row.contentType,
    size: row.size,
    status: row.status as AssetStatus,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

// Whitelisted sort columns; anything else falls back to newest-first.
const SORT_COLUMNS = {
  filename: assets.filename,
  size: assets.size,
  createdAt: assets.createdAt,
} as const;

export class DrizzleAssetsRepository implements AssetsRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async insert(orgId: string, asset: Asset): Promise<Asset> {
    const [row] = await this.db
      .insert(assets)
      .values({
        id: asset.id,
        orgId,
        key: asset.key,
        kind: asset.kind,
        filename: asset.filename,
        contentType: asset.contentType,
        size: asset.size,
        status: asset.status,
        uploadedBy: asset.uploadedBy,
        createdAt: new Date(asset.createdAt),
      })
      .returning();
    if (!row) throw new Error("failed to insert asset");
    return toAsset(row);
  }

  async list(orgId: string, query: AssetsQuery): Promise<Page<Asset>> {
    const filters: (SQL | undefined)[] = [eq(assets.orgId, orgId)];
    if (query.kind) filters.push(eq(assets.kind, query.kind));
    const q = query.search?.trim();
    if (q) filters.push(ilike(assets.filename, `%${q}%`));
    const where = and(...filters);

    const orderBy = (() => {
      if (!query.sort) return desc(assets.createdAt);
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

  async update(
    id: string,
    patch: Partial<Pick<Asset, "size" | "contentType" | "status">>,
  ): Promise<Asset | null> {
    const [row] = await this.db
      .update(assets)
      .set({
        ...(patch.size !== undefined ? { size: patch.size } : {}),
        ...(patch.contentType !== undefined ? { contentType: patch.contentType } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
      })
      .where(eq(assets.id, id))
      .returning();
    return row ? toAsset(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db.delete(assets).where(eq(assets.id, id)).returning({ id: assets.id });
    return deleted.length > 0;
  }
}
