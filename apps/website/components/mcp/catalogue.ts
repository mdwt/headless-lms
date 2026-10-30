import data from "@/lib/mcp-catalogue.json";

export type Role = "owner" | "admin" | "instructor";
export type Kind = "read" | "write" | "destructive";

export type Field = { name: string; type: string; required: boolean; description: string | null };

export type Tool = {
  name: string;
  title: string;
  description: string;
  resource: string;
  scope: string;
  kind: Kind;
  idempotent: boolean;
  openWorld: boolean;
  fields: Field[];
};

export type Scope = {
  scope: string;
  resource: string;
  action: string;
  permission: string | null;
  roles: Role[];
  removes: boolean;
};

export const catalogue = data as { instructions: string; scopes: Scope[]; tools: Tool[] };

export const ROLES: { role: Role; label: string }[] = [
  { role: "owner", label: "Owner" },
  { role: "admin", label: "Admin" },
  { role: "instructor", label: "Instructor" },
];

export const RESOURCE_LABELS: Record<string, string> = {
  courses: "Courses",
  downloads: "Downloads",
  bundles: "Bundles",
  media: "Media",
  students: "Students",
  access: "Access",
  analytics: "Analytics",
  automations: "Workflows and webhooks",
  comments: "Comments",
  communities: "Communities",
  community_members: "Community members",
  community_moderation: "Community moderation",
};

export const ACTION_LABELS: Record<string, string> = {
  read: "View",
  write: "Change",
  delete: "Delete",
  invite: "Invite",
  moderate: "Moderate",
};

export const KIND_LABELS: Record<Kind, string> = {
  read: "Reads",
  write: "Changes",
  destructive: "Removes",
};

export function resources(): string[] {
  return [...new Set(catalogue.scopes.map((scope) => scope.resource))];
}

export function rolesLabel(roles: Role[]): string {
  if (roles.length === ROLES.length) {
    return "Any staff";
  }
  const text = roles.join(", ").replace(/, ([^,]*)$/, " and $1");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
