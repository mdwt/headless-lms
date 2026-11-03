import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { DigestRunRepository } from "@headless-lms/core/discussion";
import type { DigestRun, Logger } from "@headless-lms/core/types";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { digestRuns } from "../schema/index.js";
import { translateDbErrors } from "./pg-errors.js";

export class DrizzleDigestRunRepository implements DigestRunRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async listRuns(): Promise<DigestRun[]> {
    return this.db.select().from(digestRuns);
  }

  async advance(orgId: string, communityId: string, dueAt: Date): Promise<boolean> {
    const rows = await this.db
      .insert(digestRuns)
      .values({ orgId, communityId, lastDueAt: dueAt })
      .onConflictDoUpdate({
        target: [digestRuns.orgId, digestRuns.communityId],
        set: { lastDueAt: sql`excluded.last_due_at` },
        setWhere: sql`${digestRuns.lastDueAt} < excluded.last_due_at`,
      })
      .returning({ orgId: digestRuns.orgId });
    this.logger.debug("digest run advanced", { orgId, communityId, moved: rows.length > 0 });
    return rows.length > 0;
  }
}
translateDbErrors(DrizzleDigestRunRepository);
