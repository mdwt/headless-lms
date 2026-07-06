"use server";

// Server action for organization-profile updates.

import { revalidatePath } from "next/cache";
import { Organizations } from "@headless-lms/sdk";

import { ensureConfigured, authHeaders, unwrap } from "@/lib/api/server-call";
import type { Organization } from "@/lib/api/types";

export async function updateOrganizationAction(input: {
  name: string;
  slug: string;
}): Promise<Organization> {
  ensureConfigured();
  const org = unwrap(
    await Organizations.updateOrganization({ body: input, ...(await authHeaders()) }),
  );
  // The org name/slug show up in the app shell (logo, title) and this form, so
  // bust the whole layout tree, not just this page.
  revalidatePath("/", "layout");
  return org;
}
