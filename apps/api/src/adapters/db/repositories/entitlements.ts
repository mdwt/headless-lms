// entitlements — Drizzle repository (implements the core outbound port). Empty.
import type { EntitlementsRepository } from "../../../core/entitlements/ports.js";
import type { EntitlementsEntity } from "../../../core/entitlements/model.js";

export class DrizzleEntitlementsRepository implements EntitlementsRepository {
  async findById(_id: string): Promise<EntitlementsEntity | null> {
    throw new Error("not implemented");
  }
}
