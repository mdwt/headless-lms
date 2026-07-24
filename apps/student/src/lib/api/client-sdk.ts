// One-time browser-side SDK configuration for client mutations. Server calls
// configure their own instance in server-call.ts.
import { configureSdk } from "@headless-lms/sdk";

let configured = false;
export function ensureClientSdk(): void {
  if (configured) return;
  configureSdk({ baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000" });
  configured = true;
}
