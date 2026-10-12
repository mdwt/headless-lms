import { z } from 'zod';
import { ACCESS_SCOPES } from '@headless-lms/core/organizations';

export const ScopeOption = z.object({ scope: z.enum(ACCESS_SCOPES), allowed: z.boolean() });
export const ScopeOptionList = z.array(ScopeOption);

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
  start: z.string().nullable(),
  scopes: z.array(z.string()),
  createdAt: z.coerce.date(),
  lastUsedAt: z.coerce.date().nullable(),
});
export const ApiKeyList = z.array(ApiKey);
export const CreatedApiKey = ApiKey.extend({ key: z.string() });
export const CreateApiKey = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.enum(ACCESS_SCOPES)).min(1),
});
export const ApiKeyIdParam = z.object({ id: z.string() });
