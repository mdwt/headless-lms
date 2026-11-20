import { and, asc, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { AppsRepository } from "@headless-lms/core/shared/apps";
import type { App, UpdateAppInput } from "@headless-lms/core/types";
import { ConflictError, InvalidInputError } from "@headless-lms/core/shared/errors";
import { apps } from "../schema/apps.js";
import { pgErrorFields, translateDbErrors } from "./pg-errors.js";

const TAKEN: Record<string, { code: string; message: string }> = {
  apps_domain_uq: { code: "domain_taken", message: "That domain is already in use" },
  apps_org_slug_uq: { code: "slug_taken", message: "That slug is already in use" },
  apps_courses_uq: {
    code: "courses_taken",
    message: "The organization already has an app that serves courses",
  },
  apps_community_uq: {
    code: "community_taken",
    message: "The organization already has an app that serves the community",
  },
};

function refused(err: unknown): unknown {
  const pg = pgErrorFields(err);
  if (pg?.code === "23514" && pg.constraint === "apps_serves_ck") {
    return Object.assign(new InvalidInputError("An app serves courses, the community, or both"), {
      cause: err,
    });
  }
  const taken = pg?.code === "23505" && pg.constraint ? TAKEN[pg.constraint] : undefined;
  return taken ? Object.assign(new ConflictError(taken.message, taken.code), { cause: err }) : err;
}

export class DrizzleAppsRepository implements AppsRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async create(app: App): Promise<App> {
    try {
      const [row] = await this.db.insert(apps).values(app).returning();
      if (!row) {
        throw new Error("failed to insert app");
      }
      return row;
    } catch (err) {
      throw refused(err);
    }
  }

  async list(orgId: string): Promise<App[]> {
    return this.db
      .select()
      .from(apps)
      .where(eq(apps.orgId, orgId))
      .orderBy(desc(apps.courses), asc(apps.id));
  }

  async find(orgId: string, id: string): Promise<App | null> {
    const [row] = await this.db
      .select()
      .from(apps)
      .where(and(eq(apps.orgId, orgId), eq(apps.id, id)))
      .limit(1);
    return row ?? null;
  }

  async findByDomain(domain: string): Promise<App | null> {
    const [row] = await this.db.select().from(apps).where(eq(apps.domain, domain)).limit(1);
    return row ?? null;
  }

  async update(orgId: string, id: string, patch: UpdateAppInput): Promise<App | null> {
    const changes = {
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.slug !== undefined && { slug: patch.slug }),
      ...(patch.domain !== undefined && { domain: patch.domain }),
      ...(patch.courses !== undefined && { courses: patch.courses }),
      ...(patch.community !== undefined && { community: patch.community }),
    };
    if (Object.keys(changes).length === 0) {
      return this.find(orgId, id);
    }
    try {
      const [row] = await this.db
        .update(apps)
        .set(changes)
        .where(and(eq(apps.orgId, orgId), eq(apps.id, id)))
        .returning();
      return row ?? null;
    } catch (err) {
      throw refused(err);
    }
  }

  async delete(orgId: string, id: string): Promise<App | null> {
    const [row] = await this.db
      .delete(apps)
      .where(and(eq(apps.orgId, orgId), eq(apps.id, id)))
      .returning();
    return row ?? null;
  }
}
translateDbErrors(DrizzleAppsRepository);
