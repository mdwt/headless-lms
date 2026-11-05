import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance, type RouteOptions } from 'fastify';
import ts from 'typescript';
import { digestsDeclarations } from '@headless-lms/core/discussion';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Container } from '../app/container.js';
import { mcpEndpoints } from '../app/mcp-endpoints.js';
import { registerRoutes } from './routes.js';
import { registerAuth } from './plugins/auth.js';
import { TOOLS } from './mcp/tools/index.js';
import { OPERATION_REGISTRY, declarationOf } from './operations.js';

const CORE = fileURLToPath(new URL('../../../core/src/', import.meta.url));

const SERVICE_CLASSES: Record<string, [file: string, className: string]> = {
  organizations: ['organizations/service.ts', 'OrganizationServiceImpl'],
  notificationCatalog: ['organizations/notification-catalog.ts', 'NotificationCatalog'],
  orgNotificationCategories: [
    'organizations/notification-categories.ts',
    'OrgNotificationCategories',
  ],
  communityNotificationCategories: [
    'content/notification-categories.ts',
    'CommunityNotificationCategories',
  ],
  content: ['content/service.ts', 'ContentService'],
  entitlements: ['entitlements/service.ts', 'EntitlementsServiceImpl'],
  progress: ['progress/service.ts', 'ProgressServiceImpl'],
  discussion: ['discussion/service.ts', 'DiscussionServiceImpl'],
  posts: ['discussion/posts.ts', 'PostServiceImpl'],
  chats: ['discussion/chats.ts', 'ChatServiceImpl'],
  subscriptions: ['discussion/subscriptions.ts', 'SubscriptionServiceImpl'],
  digests: ['discussion/digests.ts', 'DigestServiceImpl'],
  assets: ['assets/service.ts', 'AssetsServiceImpl'],
  integrations: ['integrations/service.ts', 'IntegrationsServiceImpl'],
  automations: ['automations/service.ts', 'AutomationsServiceImpl'],
  notificationList: ['automations/notifications/service.ts', 'NotificationsServiceImpl'],
  identity: ['identity/service.ts', 'IdentityServiceImpl'],
  devices: ['identity/devices.ts', 'DevicesServiceImpl'],
  notificationSettings: ['identity/notification-settings.ts', 'NotificationSettingsServiceImpl'],
  'reporting.admin': ['reporting/admin/service.ts', 'AdminReportServiceImpl'],
  'reporting.member': ['reporting/member/service.ts', 'MemberReportServiceImpl'],
};

function publicMethods(file: string, className: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(`${CORE}${file}`, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const found = source.statements.find(
    (statement): statement is ts.ClassDeclaration =>
      ts.isClassDeclaration(statement) && statement.name?.text === className,
  );
  if (!found) {
    throw new Error(`${className} is not in ${file}`);
  }
  const hidden = [
    ts.SyntaxKind.PrivateKeyword,
    ts.SyntaxKind.ProtectedKeyword,
    ts.SyntaxKind.StaticKeyword,
  ];
  return found.members
    .filter(
      (member) =>
        (ts.isMethodDeclaration(member) ||
          (ts.isPropertyDeclaration(member) &&
            member.initializer !== undefined &&
            (ts.isArrowFunction(member.initializer) ||
              ts.isFunctionExpression(member.initializer)))) &&
        !ts.isPrivateIdentifier(member.name) &&
        !(ts.getModifiers(member) ?? []).some((modifier) => hidden.includes(modifier.kind)),
    )
    .map((member) => member.name!.getText(source));
}

const anything: unknown = new Proxy(() => anything, { get: () => anything });

let app: FastifyInstance;
const routes: RouteOptions[] = [];

beforeAll(async () => {
  app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.addHook('onRoute', (route) => {
    routes.push(route);
  });
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
});

afterAll(async () => {
  await app.close();
});

const apiRoutes = () =>
  routes.filter(
    (route) =>
      route.url.startsWith('/api/') &&
      !route.url.startsWith('/api/auth') &&
      route.method !== 'HEAD' &&
      !(route.schema as { hide?: boolean } | undefined)?.hide,
  );

describe('operations', () => {
  it('names a declared core operation on every API route', () => {
    const missing = apiRoutes()
      .filter((route) => {
        const operation = (route.config as { operation?: string } | undefined)?.operation;
        return !operation || declarationOf(operation) === null;
      })
      .map((route) => `${String(route.method)} ${route.url}`);
    expect(missing).toEqual([]);
  });

  it('names a declared core operation on every MCP tool', () => {
    expect(
      TOOLS.filter((tool) => declarationOf(tool.operation) === null).map((t) => t.name),
    ).toEqual([]);
  });

  it('declares every operation with a known kind', () => {
    for (const [namespace, declarations] of Object.entries(OPERATION_REGISTRY)) {
      for (const [method, declaration] of Object.entries(declarations)) {
        const ok =
          ['member', 'system', 'public', 'owner'].includes(declaration as string) ||
          (typeof declaration === 'object' && declaration.permissions.length > 0);
        expect(ok, `${namespace}.${method}`).toBe(true);
      }
    }
  });

  it('declares every public method of every service class, and nothing else', () => {
    const registry: Record<string, Readonly<Record<string, unknown>>> = {
      ...OPERATION_REGISTRY,
      digests: digestsDeclarations,
    };
    expect(Object.keys(SERVICE_CLASSES).sort()).toEqual(Object.keys(registry).sort());
    const problems: string[] = [];
    for (const [namespace, [file, className]] of Object.entries(SERVICE_CLASSES)) {
      const methods = publicMethods(file, className);
      const declared = Object.keys(registry[namespace]!);
      problems.push(
        ...methods.filter((m) => !declared.includes(m)).map((m) => `${namespace}.${m} undeclared`),
        ...declared
          .filter((d) => !methods.includes(d))
          .map((d) => `${namespace}.${d} not a method`),
      );
    }
    expect(problems).toEqual([]);
  });

  it('never routes a person to a system operation', () => {
    const system = apiRoutes()
      .map((route) => (route.config as { operation?: string } | undefined)?.operation)
      .filter((operation): operation is string => declarationOf(operation ?? '') === 'system');
    expect(system).toEqual([]);
  });
});
