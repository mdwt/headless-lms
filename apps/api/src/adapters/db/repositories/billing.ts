// billing — Drizzle repository (implements the core outbound port). Empty.
import type { BillingRepository } from "../../../core/billing/ports.js";
import type { BillingEntity } from "../../../core/billing/model.js";

export class DrizzleBillingRepository implements BillingRepository {
  async findById(_id: string): Promise<BillingEntity | null> {
    throw new Error("not implemented");
  }
}
