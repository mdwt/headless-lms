import type { Declarations } from '../shared/declarations.js';
import type { ProgressService } from './ports.js';

export const progressDeclarations = {
  report: 'member',
  get: 'system',
  listByTargets: 'system',
} as const satisfies Declarations<ProgressService>;
