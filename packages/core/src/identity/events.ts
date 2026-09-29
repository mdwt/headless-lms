import { userSchema } from '../types/schemas/index.js';
import { defineEvent, type EventOf, type EventOfValues } from '../shared/ports.js';

const publicUser = userSchema
  .pick({
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    createdAt: true,
    updatedAt: true,
  })
  .strip();

export const identityEvents = {
  userCreated: defineEvent({
    type: 'identity.user.created',
    version: 1,
    data: userSchema,
    publicData: publicUser,
  }),
  userUpdated: defineEvent({
    type: 'identity.user.updated',
    version: 1,
    data: userSchema,
    publicData: publicUser,
  }),
  userDeleted: defineEvent({
    type: 'identity.user.deleted',
    version: 1,
    data: userSchema,
  }),
};

export type UserCreated = EventOf<typeof identityEvents.userCreated>;
export type UserUpdated = EventOf<typeof identityEvents.userUpdated>;
export type UserDeleted = EventOf<typeof identityEvents.userDeleted>;
export type IdentityEvent = EventOfValues<typeof identityEvents>;
