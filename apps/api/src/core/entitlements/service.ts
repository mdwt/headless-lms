// entitlements context — service implementation (inbound port). Empty methods.
import type { EntitlementsService, EntitlementsRepository } from "./ports.js";

export class EntitlementsServiceImpl implements EntitlementsService {
  constructor(private readonly repo: EntitlementsRepository) {}
}
