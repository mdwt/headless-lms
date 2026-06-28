// progress context — ports.
// Inbound: the use-case interface the service implements.
// Outbound: contracts this context needs (repository, other contexts' capabilities).
import type { ProgressEntity } from "./model.js";

// Inbound port (use cases the service exposes). Methods added later.
export interface ProgressService {
  // intentionally empty for bootstrap
}

// Outbound port (persistence contract the repository fulfils)
export interface ProgressRepository {
  findById(id: string): Promise<ProgressEntity | null>;
}
