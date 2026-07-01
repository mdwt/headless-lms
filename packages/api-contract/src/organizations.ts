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
