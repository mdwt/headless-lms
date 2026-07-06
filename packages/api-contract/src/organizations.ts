// Organization resource schemas. Org creation is served by the API's own
// `/api/organizations` route (which drives Better Auth under the hood), so the
// created org is part of the typed contract and SDK — not the auth namespace.
import { z } from "zod";

export const Organization = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.string(),
});
export type Organization = z.infer<typeof Organization>;

export const CreateOrganization = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
});
export type CreateOrganization = z.infer<typeof CreateOrganization>;

// Update the active organization's profile. Slug must stay URL-safe (Better Auth
// enforces uniqueness); both fields are sent together from the settings form.
export const UpdateOrganization = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens only"),
});
export type UpdateOrganization = z.infer<typeof UpdateOrganization>;
