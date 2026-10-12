export const SCOPE_RESOURCES: { resource: string; label: string }[] = [
  { resource: "courses", label: "Courses" },
  { resource: "downloads", label: "Downloads" },
  { resource: "bundles", label: "Bundles" },
  { resource: "media", label: "Media" },
  { resource: "students", label: "Students" },
  { resource: "access", label: "Access" },
  { resource: "analytics", label: "Analytics" },
  { resource: "automations", label: "Workflows and webhooks" },
  { resource: "comments", label: "Comments" },
];

export const SCOPE_ACTION_LABELS: Record<string, string> = {
  read: "View",
  write: "Change",
  delete: "Delete",
  invite: "Invite (sends email)",
  moderate: "Moderate",
};

export const SCOPE_NOTES: Record<string, string> = {
  "downloads:write": "Change includes removing files from a download.",
  "bundles:write": "Change includes removing items from a bundle.",
  "access:write": "Change includes revoking a student's access.",
  "comments:moderate": "Moderate includes removing comments.",
};

export function isOAuthFlow(
  search: URLSearchParams | Record<string, string | string[] | undefined>,
): boolean {
  const get = (key: string) => (search instanceof URLSearchParams ? search.get(key) : search[key]);
  return Boolean(get("sig")) && Boolean(get("client_id"));
}

export function loginRedirect(
  search: Record<string, string | string[] | undefined>,
  signedIn: boolean,
): string | null {
  return signedIn && !isOAuthFlow(search) ? "/onboarding" : null;
}

export function defaultSelected(scope: string): boolean {
  return scope.endsWith(":read");
}

export function isDeleteScope(scope: string): boolean {
  return scope.endsWith(":delete");
}

export function pickerScopes(
  requested: string | null | undefined,
  options: { scope: string; allowed: boolean }[],
): string[] {
  const wanted = new Set((requested ?? "").split(" "));
  return options
    .filter((option) => option.allowed && wanted.has(option.scope))
    .map((option) => option.scope);
}

export function clientDisplayName(clientId: string, ok: boolean, body: unknown): string {
  if (!ok || !body || typeof body !== "object") return clientId;
  const name = (body as { client_name?: unknown }).client_name;
  return typeof name === "string" && name ? name : clientId;
}

export function toSearchParams(
  search: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
  }
  return params;
}
