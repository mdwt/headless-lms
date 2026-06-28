// offers — Drizzle repository (implements the core outbound port). Empty.
import type { OffersRepository } from "../../../core/offers/ports.js";
import type { OffersEntity } from "../../../core/offers/model.js";

export class DrizzleOffersRepository implements OffersRepository {
  async findById(_id: string): Promise<OffersEntity | null> {
    throw new Error("not implemented");
  }
}
