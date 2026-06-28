// courses context — service implementation (inbound port). Empty methods.
import type { CoursesService, CoursesRepository } from "./ports.js";

export class CoursesServiceImpl implements CoursesService {
  constructor(private readonly repo: CoursesRepository) {}
}
