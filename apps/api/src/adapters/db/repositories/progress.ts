// progress — Drizzle repository (implements the core outbound port). Empty.
import type { ProgressRepository } from "../../../core/progress/ports.js";
import type { ProgressEntity } from "../../../core/progress/model.js";

export class DrizzleProgressRepository implements ProgressRepository {
  async findById(_id: string): Promise<ProgressEntity | null> {
    throw new Error("not implemented");
  }
}
