import type { PushDevice, PushMessage } from "@headless-lms/core/types";

export type Outcome =
  | { kind: "accepted" }
  | { kind: "dead"; error: string }
  | { kind: "failed"; retryable: boolean; error: string };

export interface ProviderSender {
  send(device: PushDevice, message: PushMessage): Promise<Outcome>;
}

export const accepted: Outcome = { kind: "accepted" };

export function dead(error: string): Outcome {
  return { kind: "dead", error };
}

export function failed(retryable: boolean, error: string): Outcome {
  return { kind: "failed", retryable, error };
}

export function retryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
