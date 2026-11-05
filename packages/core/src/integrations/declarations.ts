import { requires, type Declarations } from '../shared/declarations.js';
import type { IntegrationsService } from './ports.js';

export const integrationsDeclarations = {
  available: requires('integrations:read'),
  connect: requires('integrations:write'),
  reconnect: requires('integrations:write'),
  configure: requires('integrations:write'),
  disconnect: requires('integrations:delete'),
  list: requires('integrations:read'),
  get: requires('integrations:read'),
  getByIntegration: 'system',
  invoke: requires('integrations:write'),
} as const satisfies Declarations<IntegrationsService>;
