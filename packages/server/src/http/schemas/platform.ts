import { z } from 'zod';
import { ApiKeyName, CreatedApiKey } from './access.js';
import { Organization } from './organizations.js';

export const CreatePlatformOrganization = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and hyphens only'),
  keyName: ApiKeyName.optional().describe(
    'The name of the API key created with it. Default `Platform`',
  ),
});

export const PlatformOrganization = z.object({
  organization: Organization,
  apiKey: CreatedApiKey,
});

export const CreatePlatformApiKey = z.object({ name: ApiKeyName });

export const PlatformOrgIdParam = z.object({ orgId: z.string() });
