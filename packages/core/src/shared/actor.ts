import type { Role } from '../types/schemas/organizations.js';

export interface Actor {
  id: string;
  role: Role;
}
