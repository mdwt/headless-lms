// OpenAPI documentation. @fastify/swagger reads the Zod route schemas (via the
// transform) to build the spec the frontend SDK is generated from; it must be
// registered before the routes so its onRoute hook captures them. UI + JSON are
// served under /docs.
import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform, jsonSchemaTransformObject } from 'fastify-type-provider-zod';
import type { ServerConfig } from '../config.js';
import { ErrorBody, ValidationErrorBody } from '../schemas/shared.js';
import pkg from '../../../package.json' with { type: 'json' };

const PUBLIC_ROUTES = new Set(['GET /api/organizations/invites/:token']);

type RouteSchema = {
  body?: unknown;
  querystring?: unknown;
  params?: unknown;
  response?: Record<string, unknown>;
};

function withDefaultResponses(
  schema: RouteSchema | undefined,
  method: string,
  url: string,
): RouteSchema | undefined {
  if (!schema || !url.startsWith('/api/') || url.startsWith('/api/auth/')) {
    return schema;
  }
  const response: Record<string, unknown> = { ...(schema.response ?? {}) };
  if ((schema.body || schema.querystring || schema.params) && !response['400']) {
    response['400'] = ValidationErrorBody;
  }
  if (!PUBLIC_ROUTES.has(`${method} ${url}`) && !response['401']) {
    response['401'] = ErrorBody;
  }
  if (!response['500']) {
    response['500'] = ErrorBody;
  }
  return { ...schema, response };
}

export function registerOpenApi(app: FastifyInstance, config: ServerConfig): void {
  app.register(swagger, {
    openapi: {
      info: {
        title: 'Headless LMS API',
        version: pkg.version,
        description: 'API documentation for the Headless LMS platform',
        license: {
          name: 'MIT',
          url: 'https://opensource.org/licenses/MIT',
        },
      },
      servers: [{ url: config.publicUrl }],
      tags: [
        {
          name: 'Organizations',
          description: 'The tenant: its members, roles, invites and students',
        },
        {
          name: 'Content',
          description: 'Authored content: courses and downloads, their structure and delivery',
        },
        { name: 'Entitlements', description: 'Access grants to content' },
        {
          name: 'Progress',
          description: 'Per-student progress and completion through course content',
        },
        { name: 'Discussion', description: 'Learner comments, replies, reactions and moderation' },
        {
          name: 'Communities',
          description: 'Communities, their spaces, topics, and direct-message settings',
        },
        { name: 'Posts', description: 'Posts in a space, reactions, and the moderation queue' },
        { name: 'Chats', description: 'Direct and group chats inside one community' },
        { name: 'Profile', description: 'The signed-in member profile' },
        { name: 'Assets', description: 'The org media library: uploads, serving and lifecycle' },
        {
          name: 'Files',
          description: 'Stable file URLs that check access and redirect to a signed storage URL',
        },
        { name: 'Automations', description: 'Workflows and webhooks that react to system events' },
        { name: 'Integrations', description: 'Connections to external services' },
        { name: 'Reporting', description: 'Reporting and analytics' },
      ],
    },
    transform: (input) => {
      const method = String(
        Array.isArray(input.route.method) ? input.route.method[0] : input.route.method,
      );
      return jsonSchemaTransform({
        ...input,
        schema: withDefaultResponses(input.schema as RouteSchema | undefined, method, input.url),
      } as typeof input);
    },
    transformObject: jsonSchemaTransformObject,
  });
  app.register(swaggerUi, { routePrefix: '/docs' });
}
