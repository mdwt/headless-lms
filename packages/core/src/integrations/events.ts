import { connectionSchema } from '../types/schemas/index.js';
import { defineEvent, type EventOf, type EventOfValues } from '../shared/ports.js';

const publicConnection = connectionSchema
  .pick({
    orgId: true,
    id: true,
    integrationId: true,
    config: true,
    active: true,
    createdAt: true,
    updatedAt: true,
  })
  .strip();

export const integrationEvents = {
  connectionCreated: defineEvent({
    type: 'integration.connection.created',
    version: 1,
    data: connectionSchema,
    publicData: publicConnection,
  }),
  connectionUpdated: defineEvent({
    type: 'integration.connection.updated',
    version: 1,
    data: connectionSchema,
    publicData: publicConnection,
  }),
  connectionRemoved: defineEvent({
    type: 'integration.connection.removed',
    version: 1,
    data: connectionSchema,
    publicData: publicConnection,
  }),
};

export type ConnectionCreated = EventOf<typeof integrationEvents.connectionCreated>;
export type ConnectionUpdated = EventOf<typeof integrationEvents.connectionUpdated>;
export type ConnectionRemoved = EventOf<typeof integrationEvents.connectionRemoved>;
export type IntegrationEvent = EventOfValues<typeof integrationEvents>;
