"use server";

// Server actions for integration connection mutations.

import { revalidatePath } from "next/cache";
import { Integrations } from "@headless-lms/sdk";

import { ensureConfigured, authHeaders, expectOk } from "@/lib/api/server-call";
import { unwrap } from "@/lib/api/shared";

const PATH = "/settings/integrations";

export async function connectIntegrationAction(input: {
  integrationId: string;
  secrets: Record<string, unknown>;
  config?: Record<string, unknown>;
}): Promise<void> {
  ensureConfigured();
  unwrap(await Integrations.connectIntegration({ body: input, ...(await authHeaders()) }));
  revalidatePath(PATH);
}

export async function configureConnectionAction(
  id: string,
  input: { config?: Record<string, unknown>; active?: boolean },
): Promise<void> {
  ensureConfigured();
  unwrap(
    await Integrations.configureConnection({
      path: { id },
      body: input,
      ...(await authHeaders()),
    }),
  );
  revalidatePath(PATH);
}

export async function reconnectIntegrationAction(
  id: string,
  secrets: Record<string, unknown>,
): Promise<void> {
  ensureConfigured();
  unwrap(
    await Integrations.reconnectIntegration({
      path: { id },
      body: { secrets },
      ...(await authHeaders()),
    }),
  );
  revalidatePath(PATH);
}

export async function disconnectIntegrationAction(id: string): Promise<void> {
  ensureConfigured();
  expectOk(await Integrations.disconnectIntegration({ path: { id }, ...(await authHeaders()) }));
  revalidatePath(PATH);
}
