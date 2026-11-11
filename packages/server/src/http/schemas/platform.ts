import { z } from 'zod';
import { ApiKeyName, CreatedApiKey } from './access.js';
import { Organization } from './organizations.js';

export const CreatePlatformOrganization = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and hyphens only')
    .describe("Unique. The organization's first host is this slug under the platform host."),
  metadata: z
    .record(z.string().min(1).max(40), z.string().max(500))
    .refine((metadata) => Object.keys(metadata).length <= 50, 'At most 50 metadata keys')
    .optional()
    .describe('Key-value pairs stored with the organization'),
});

export const PlatformOrganizationDetails = Organization.extend({
  metadata: z.record(z.string(), z.string()),
});

export const PlatformOrganization = z.object({
  organization: PlatformOrganizationDetails,
  apiKey: CreatedApiKey,
});

export const PlatformOrganizationQuery = z.object({
  slug: z.string().min(1).max(50).describe('The slug the organization was created with'),
});

export const CreatePlatformApiKey = z.object({ name: ApiKeyName });

export const PlatformOrgIdParam = z.object({ orgId: z.string() });
