// billing context — service implementation (inbound port). Empty methods.
import type { BillingService, BillingRepository } from "./ports.js";

export class BillingServiceImpl implements BillingService {
  constructor(private readonly repo: BillingRepository) {}
}
