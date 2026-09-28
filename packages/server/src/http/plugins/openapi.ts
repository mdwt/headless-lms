// OpenAPI documentation. @fastify/swagger reads the Zod route schemas (via the
// transform) to build the spec the frontend SDK is generated from; it must be
// registered before the routes so its onRoute hook captures them. UI + JSON are
// served under /docs.
import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform, jsonSchemaTransformObject } from 'fastify-type-provider-zod';
import type { ServerConfig } from '../config.js';
import pkg from '../../../package.json' with { type: 'json' };

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
        { name: 'Assets', description: 'The org media library: uploads, serving and lifecycle' },
        { name: 'Automations', description: 'Trigger/action workflows' },
        { name: 'Integrations', description: 'Connections to external services' },
        { name: 'Reporting', description: 'Reporting and analytics' },
      ],
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });
  app.register(swaggerUi, { routePrefix: '/docs' });
}
