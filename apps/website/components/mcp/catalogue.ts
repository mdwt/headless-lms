import data from "@/lib/mcp-catalogue.json";

export type Kind = "read" | "write" | "destructive";

export type Field = { name: string; type: string; required: boolean; description: string | null };

export type Tool = {
  name: string;
  title: string;
  description: string;
  resource: string;
  operation: string;
  permissions: string[];
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

export const RESOURCE_LABELS: Record<string, string> = {
  organizations: "Organization",
  api_keys: "API keys",
  notification_categories: "Notification categories",
  integrations: "Integrations",
  analytics: "Analytics",
  people: "People",
  roles: "Roles",
  access: "Access",
  bundles: "Bundles",
  media: "Media",
  courses: "Courses",
  progress: "Learners and progress",
  downloads: "Downloads",
  communities: "Communities",
  automations: "Workflows and webhooks",
  discussion: "Comments",
  posts: "Posts",
  entitlements: "Space members",
};

export const ABOUT_LABELS: Record<string, string> = {
  org: "About the organization",
  course: "About a course",
  download: "About a download",
  community: "About a community",
};

export const ACTION_LABELS: Record<string, string> = {
  read: "View",
  write: "Change",
  delete: "Delete",
  moderate: "Moderate",
};

export const KIND_LABELS: Record<Kind, string> = {
  read: "Reads",
  write: "Changes",
  destructive: "Removes",
};

export function resources(): string[] {
  return [...new Set(catalogue.permissions.map((permission) => permission.resource))];
}

export function toolResources(): string[] {
  const order = resources();
  const own = [...new Set(catalogue.tools.map((tool) => tool.resource))];
  return [
    ...order.filter((resource) => own.includes(resource)),
    ...own.filter((resource) => !order.includes(resource)),
  ];
}

export function abouts(): string[] {
  return [...new Set(catalogue.permissions.map((permission) => permission.about))];
}

export function listText(items: string[]): string {
  return items.join(", ").replace(/, ([^,]*)$/, " and $1");
}
