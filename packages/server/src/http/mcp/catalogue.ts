import {
  ALL_PERMISSIONS,
  DEFAULT_ROLES,
  PERMISSIONS,
  withImplied,
} from '@headless-lms/core/organizations';
import type { Level, Permission } from '@headless-lms/core/types';
import { permissionFor } from '../operations.js';
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
  operation: string;
  permissions: Permission[];
  kind: ToolKind;
  idempotent: boolean;
  openWorld: boolean;
  fields: CatalogueField[];
}

export interface CataloguePermission {
  permission: Permission;
  resource: string;
  action: string;
  label: string;
  description: string;
  about: Level;
  roles: string[];
  removes: boolean;
}

export interface McpCatalogue {
  instructions: string;
  permissions: CataloguePermission[];
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

export function mcpCatalogue(): McpCatalogue {
  return {
    instructions: MCP_INSTRUCTIONS,
    permissions: ALL_PERMISSIONS.map((permission) => {
      const [resource = permission, action = ''] = permission.split(':');
      const definition = PERMISSIONS[permission];
      return {
        permission,
        resource,
        action,
        label: definition.label,
        description: definition.description,
        about: definition.about,
        roles: DEFAULT_ROLES.filter((role) => withImplied(role.permissions).has(permission)).map(
          (role) => role.name,
        ),
        removes: action === 'delete',
      };
    }),
    tools: TOOLS.map((tool) => {
      const permissions = [...permissionFor(tool.operation)];
      return {
        name: tool.name,
        title: tool.title,
        description: tool.description,
        resource: permissions[0]?.split(':')[0] ?? tool.operation.split('.')[0] ?? tool.operation,
        operation: tool.operation,
        permissions,
        kind: tool.kind,
        idempotent: tool.idempotent,
        openWorld: tool.openWorld,
        fields: fieldsOf(tool),
      };
    }),
  };
}
