import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Container } from '../../app/container.js';
import type { ServerConfig } from '../config.js';
import { registerRoutes } from '../routes.js';
import { registerAuth } from './auth.js';
import { registerOpenApi } from './openapi.js';
import { mcpEndpoints } from '../../app/mcp-endpoints.js';

type Operation = {
  operationId?: string;
  tags?: string[];
  summary?: string;
  description?: string;
  requestBody?: { content: Record<string, { schema: unknown }> };
  responses: Record<string, { content?: Record<string, { schema: JsonSchema }> }>;
};
type JsonSchema = { type?: string; format?: string; properties?: Record<string, JsonSchema> };
type Document = {
  tags: { name: string }[];
  paths: Record<string, Record<string, Operation>>;
};

const STAFFLESS = new Set([
  'createOrganization',
  'getInvite',
  'acceptInvite',
  'getMemberOrg',
  'markAllMemberNotificationsRead',
  'getMemberNotificationPreferences',
  'setMemberNotificationPreferences',
  'getMemberProfile',
]);

const anything: unknown = new Proxy(() => anything, { get: () => anything });

let app: FastifyInstance;
let operations: Operation[];

beforeAll(async () => {
  app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerOpenApi(app, { publicUrl: 'http://localhost' } as ServerConfig);
  registerAuth(
    app,
    new Proxy(
      {
        mcp: mcpEndpoints({
          authBaseURL: 'https://lms.example.com',
          adminAppUrl: 'https://admin.example.com',
        }),
      },
      { get: (target, key) => (key === 'mcp' ? target.mcp : anything) },
    ) as unknown as Container,
  );
  registerRoutes(app, anything as Container);
  await app.ready();
  const document = app.swagger() as unknown as Document;
  operations = Object.entries(document.paths)
    .filter(([path]) => path.startsWith('/api/') && !path.startsWith('/api/auth/'))
    .flatMap(([, methods]) => Object.values(methods));
  declaredTags = new Set(document.tags.map((tag) => tag.name));
});

afterAll(async () => {
  await app.close();
});

let declaredTags: Set<string>;

describe('the OpenAPI contract', () => {
  it('declares every tag a route uses', () => {
    expect(operations.length).toBeGreaterThan(200);
    const used = new Set(operations.flatMap((op) => op.tags ?? []));
    expect([...used].filter((tag) => !declaredTags.has(tag))).toEqual([]);
  });

  it('gives every route a summary and a description', () => {
    const bare = operations.filter((op) => !op.summary || !op.description);
    expect(bare.map((op) => op.operationId)).toEqual([]);
  });

  it('gives every route its own summary', () => {
    const seen = new Map<string, string[]>();
    for (const op of operations) {
      seen.set(op.summary!, [...(seen.get(op.summary!) ?? []), op.operationId!]);
    }
    expect([...seen.values()].filter((ids) => ids.length > 1)).toEqual([]);
  });

  it('keeps the validation issues on every 400', () => {
    const stripped = operations.filter((op) => {
      const schema = op.responses['400']?.content?.['application/json']?.schema;
      return schema && !schema.properties?.issues;
    });
    expect(stripped.map((op) => op.operationId)).toEqual([]);
  });

  it('declares 403 on every route that needs staff or org membership', () => {
    const missing = operations.filter(
      (op) => !STAFFLESS.has(op.operationId!) && !op.responses['403'],
    );
    expect(missing.map((op) => op.operationId)).toEqual([]);
  });

  it('describes date inputs as date-times', () => {
    const createPost = operations.find((op) => op.operationId === 'createPost')!;
    const body = createPost.requestBody!.content['application/json']!.schema as JsonSchema;
    expect(body.properties!.scheduledAt).toMatchObject({ format: 'date-time' });
  });
});
