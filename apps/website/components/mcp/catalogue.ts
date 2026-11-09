import data from "@/lib/mcp-catalogue.json";

export type Kind = "read" | "write" | "destructive";

export type Field = { name: string; type: string; required: boolean; description: string | null };

export type Tool = {
  name: string;
  title: string;
  description: string;
  group: string;
  kind: Kind;
  idempotent: boolean;
  openWorld: boolean;
  fields: Field[];
};

export type Permission = {
  permission: string;
  resource: string;
  action: string;
  label: string;
  description: string;
  about: string;
  roles: string[];
  removes: boolean;
};

export const catalogue = data as {
  instructions: string;
  permissions: Permission[];
  tools: Tool[];
};

export const ROLES: string[] = [
  ...new Set(catalogue.permissions.flatMap((permission) => permission.roles)),
];

export const FULL_ROLES: string[] = ROLES.filter((role) =>
  catalogue.permissions.every((permission) => permission.roles.includes(role)),
);

export const PARTIAL_ROLES: string[] = ROLES.filter((role) => !FULL_ROLES.includes(role));

export const ABOUT_LABELS: Record<string, string> = {
  org: "About the organization",
  course: "About a course",
  download: "About a download",
  community: "About a community",
};

export const KIND_LABELS: Record<Kind, string> = {
  read: "Reads",
  write: "Changes",
  destructive: "Removes",
};

export function abouts(): string[] {
  return [...new Set(catalogue.permissions.map((permission) => permission.about))];
}

export function listText(items: string[]): string {
  return items.join(", ").replace(/, ([^,]*)$/, " and $1");
}
