// progress context — service implementation (inbound port). Empty methods.
import type { ProgressService, ProgressRepository } from "./ports.js";

export class ProgressServiceImpl implements ProgressService {
  constructor(private readonly repo: ProgressRepository) {}
}
