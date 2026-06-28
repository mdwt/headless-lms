// offers context — service implementation (inbound port). Empty methods.
import type { OffersService, OffersRepository } from "./ports.js";

export class OffersServiceImpl implements OffersService {
  constructor(private readonly repo: OffersRepository) {}
}
