// courses context — ports.
// Inbound: the use-case interface the service implements.
// Outbound: contracts this context needs (repository, other contexts' capabilities).
import type { CoursesEntity } from "./model.js";

// Inbound port (use cases the service exposes). Methods added later.
export interface CoursesService {
  // intentionally empty for bootstrap
}

// Outbound port (persistence contract the repository fulfils)
export interface CoursesRepository {
  findById(id: string): Promise<CoursesEntity | null>;
}
