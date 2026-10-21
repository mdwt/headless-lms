import { entitlementSchema, spaceMemberSchema } from '../types/schemas/index.js';
import { defineEvent, type EventOf, type EventOfValues } from '../shared/ports.js';

const publicEntitlement = entitlementSchema
  .pick({
    orgId: true,
    id: true,
    orgUserId: true,
    bundleId: true,
    contentId: true,
    status: true,
    source: true,
    grantedAt: true,
    expiresAt: true,
    createdAt: true,
    updatedAt: true,
  })
  .strip();

export const entitlementEvents = {
  entitlementCreated: defineEvent({
    type: 'entitlement.created',
    version: 1,
    data: entitlementSchema,
    publicData: publicEntitlement,
  }),
  entitlementUpdated: defineEvent({
    type: 'entitlement.updated',
    version: 1,
    data: entitlementSchema,
    publicData: publicEntitlement,
  }),
  entitlementDeleted: defineEvent({
    type: 'entitlement.deleted',
    version: 1,
    data: entitlementSchema,
    publicData: publicEntitlement,
  }),
  entitlementExpired: defineEvent({
    type: 'entitlement.expired',
    version: 1,
    data: entitlementSchema,
    publicData: publicEntitlement,
  }),
  entitlementEndingSoon: defineEvent({
    type: 'entitlement.ending_soon',
    version: 1,
    data: entitlementSchema,
    publicData: publicEntitlement,
  }),
  spaceMemberCreated: defineEvent({
    type: 'entitlement.space_member.created',
    version: 1,
    data: spaceMemberSchema,
    publicData: spaceMemberSchema,
  }),
  spaceMemberUpdated: defineEvent({
    type: 'entitlement.space_member.updated',
    version: 1,
    data: spaceMemberSchema,
    publicData: spaceMemberSchema,
  }),
  spaceMemberDeleted: defineEvent({
    type: 'entitlement.space_member.deleted',
    version: 1,
    data: spaceMemberSchema,
    publicData: spaceMemberSchema,
  }),
};

export type EntitlementCreated = EventOf<typeof entitlementEvents.entitlementCreated>;
export type EntitlementUpdated = EventOf<typeof entitlementEvents.entitlementUpdated>;
export type EntitlementDeleted = EventOf<typeof entitlementEvents.entitlementDeleted>;
export type EntitlementExpired = EventOf<typeof entitlementEvents.entitlementExpired>;
export type EntitlementEndingSoon = EventOf<typeof entitlementEvents.entitlementEndingSoon>;
export type SpaceMemberCreated = EventOf<typeof entitlementEvents.spaceMemberCreated>;
export type SpaceMemberUpdated = EventOf<typeof entitlementEvents.spaceMemberUpdated>;
export type SpaceMemberDeleted = EventOf<typeof entitlementEvents.spaceMemberDeleted>;
export type EntitlementEvent = EventOfValues<typeof entitlementEvents>;
