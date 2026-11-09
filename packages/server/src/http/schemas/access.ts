import { z } from 'zod';
import { levelSchema, permissionSchema } from '@headless-lms/core/schemas';

export const Permission = permissionSchema;
export const Level = levelSchema;

export const PermissionDefinition = z.object({
  key: permissionSchema,
  group: z.string(),
  label: z.string(),
  description: z.string(),
  about: levelSchema,
  implies: z.array(permissionSchema).optional(),
});
export const PermissionDefinitionList = z.array(PermissionDefinition);

export const ViewerPermissions = z.object({
  orgRole: z.object({ key: z.string(), name: z.string() }),
  isOwner: z.boolean(),
  org: z.array(permissionSchema),
  content: z.record(z.string(), z.array(permissionSchema)),
});

export const ConnectedApp = z.object({
  clientId: z.string(),
  name: z.string(),
  iconUrl: z.string().nullable(),
  scopes: z.array(z.string()),
  connectedAt: z.coerce.date(),
});
export const ConnectedAppList = z.array(ConnectedApp);
export const ClientIdParam = z.object({ clientId: z.string() });

export const ApiKey = z.object({
  id: z.string(),
  name: z.string().nullable(),
  start: z.string().nullable().describe('The first characters of the key, for telling keys apart'),
  role: z
    .object({
      key: z.string(),
      name: z.string().nullable().describe('Null when the organization no longer has the role'),
    })
    .nullable()
    .describe("The role whose permissions the key holds, limited to its creator's"),
  createdAt: z.coerce.date(),
  lastUsedAt: z.coerce.date().nullable(),
  expiresAt: z.coerce.date().nullable().describe('Null for a key that does not expire'),
});
export const ApiKeyList = z.array(ApiKey);
export const CreatedApiKey = ApiKey.extend({
  key: z.string().describe('The key itself. Returned once, never again'),
});
export const ApiKeyName = z.string().trim().min(1).max(80);
export const CreateApiKey = z.object({
  name: ApiKeyName,
  role: z.string().min(1).describe("The key of one of the organization's roles"),
  expiresInDays: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe('Days until the key stops working. Leave out for a key that does not expire'),
});
export const ApiKeyIdParam = z.object({ id: z.string() });
export const ApiKeyRole = z.object({ key: z.string(), name: z.string(), description: z.string() });
export const ApiKeyRoleList = z.array(ApiKeyRole);
