// OpenAPI documentation. @fastify/swagger reads the Zod route schemas (via the
// transform) to build the spec the frontend SDK is generated from; it must be
// registered before the routes so its onRoute hook captures them. UI + JSON are
// served under /docs.
import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import type { ServerConfig } from '../config.js';

export function registerOpenApi(app: FastifyInstance, config: ServerConfig): void {
  app.register(swagger, {
    openapi: {
      info: { title: 'Headless LMS API', version: '0.0.0' },
      servers: [{ url: config.publicUrl }],
      tags: [
        { name: 'Organizations', description: 'Organizations and member management' },
        { name: 'Courses', description: 'Course authoring: courses, modules, activities' },
        { name: 'Learn', description: 'Student-facing course delivery' },
        { name: 'Students', description: 'Students and their enrollments' },
        { name: 'Entitlements', description: 'Access grants to content' },
        { name: 'Progress', description: 'Completion tracking' },
        { name: 'Automations', description: 'Trigger/action workflows' },
        { name: 'Dashboard', description: 'Back-office overview' },
        { name: 'Assets', description: 'Media library and uploads' },
        { name: 'ConnectedApps', description: 'OAuth clients connected to the MCP endpoint' },
        { name: 'Integrations', description: 'Third-party integration connections' },
      ],
    },
    transform: jsonSchemaTransform,
  });
  app.register(swaggerUi, { routePrefix: '/docs' });
}
