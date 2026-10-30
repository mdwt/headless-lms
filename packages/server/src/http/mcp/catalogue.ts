import {
  ACCESS_SCOPES,
  SCOPE_PERMISSION,
  STAFF_ROLES,
  isDeleteScope,
  roleHoldsScope,
  type AccessScope,
  type StaffRole,
} from '@headless-lms/core/organizations';
import { toolInputSchema } from './input-schema.js';
import { MCP_INSTRUCTIONS } from './server.js';
import type { ToolKind } from './tool.js';
import { TOOLS } from './tools/index.js';

export interface CatalogueField {
  name: string;
  type: string;
  required: boolean;
  description: string | null;
}

export interface CatalogueTool {
  name: string;
  title: string;
  description: string;
  resource: string;
  scope: AccessScope;
  kind: ToolKind;
  idempotent: boolean;
  openWorld: boolean;
  fields: CatalogueField[];
}

export interface CatalogueScope {
  scope: AccessScope;
  resource: string;
  action: string;
  permission: string | null;
  roles: StaffRole[];
  removes: boolean;
}

export interface McpCatalogue {
  instructions: string;
  scopes: CatalogueScope[];
  tools: CatalogueTool[];
}

type JsonSchema = {
  type?: string | string[];
  format?: string;
  enum?: unknown[];
  const?: unknown;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
};

function typeOf(schema: JsonSchema): string {
  const variants = schema.anyOf ?? schema.oneOf;
  if (variants) {
    return [...new Set(variants.map(typeOf))].join(' | ');
  }
  if (schema.enum) {
    return schema.enum.map((value) => JSON.stringify(value)).join(' | ');
  }
  if (schema.const !== undefined) {
    return JSON.stringify(schema.const);
  }
  if (schema.type === 'array') {
    return `${schema.items ? typeOf(schema.items) : 'unknown'}[]`;
  }
  if (schema.format === 'date-time') {
    return 'date-time';
  }
  if (Array.isArray(schema.type)) {
    return schema.type.join(' | ');
  }
  return schema.type ?? 'unknown';
}

function descriptionOf(schema: JsonSchema): string | null {
  return (
    schema.description ??
    (schema.anyOf ?? schema.oneOf)?.find((variant) => variant.description)?.description ??
    null
  );
}

function fieldsOf(tool: (typeof TOOLS)[number]): CatalogueField[] {
  const json = toolInputSchema(tool.input)['~standard'].jsonSchema.input({
    target: 'draft-2020-12',
  }) as JsonSchema;
  const required = new Set(json.required ?? []);
  const fields = Object.entries(json.properties ?? {}).map(([name, schema]) => ({
    name,
    type: typeOf(schema),
    required: required.has(name),
    description: descriptionOf(schema),
  }));
  return [
    ...fields.filter((field) => field.required),
    ...fields.filter((field) => !field.required),
  ];
}

const REMOVING_WRITE_SCOPES: readonly AccessScope[] = [
  'downloads:write',
  'bundles:write',
  'access:write',
  'comments:moderate',
  'communities:write',
  'community_members:write',
  'community_moderation:write',
];

export function mcpCatalogue(): McpCatalogue {
  return {
    instructions: MCP_INSTRUCTIONS,
    scopes: ACCESS_SCOPES.map((scope) => {
      const [resource = scope, action = ''] = scope.split(':');
      return {
        scope,
        resource,
        action,
        permission: SCOPE_PERMISSION[scope],
        roles: STAFF_ROLES.filter((role) => roleHoldsScope(role, scope)),
        removes: isDeleteScope(scope) || REMOVING_WRITE_SCOPES.includes(scope),
      };
    }),
    tools: TOOLS.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      resource: tool.scope.split(':')[0] ?? tool.scope,
      scope: tool.scope,
      kind: tool.kind,
      idempotent: tool.idempotent,
      openWorld: tool.openWorld,
      fields: fieldsOf(tool),
    })),
  };
}
