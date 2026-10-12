import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toWebRequest } from '@modelcontextprotocol/node';
import { roleHoldsScope } from '@headless-lms/core/organizations';
import type { Container } from '../../app/container.js';
import { NoActiveOrgError, resolveScopeFor, type OrgScope } from '../scope.js';
import { unauthorized } from './challenge.js';
import { createToolServer } from './server.js';
import type { Tool, ToolContext } from './tool.js';
import { TOOLS } from './tools/index.js';

type Connection = { context: ToolContext; tools: Tool[] };

export function registerMcp(app: FastifyInstance, container: Container, tools: readonly Tool[] = TOOLS): void {
  const handler = createMcpHandler(
    (ctx) => {
      const connection = ctx.authInfo?.extra?.connection as Connection | undefined;
      if (!connection) {
        throw new Error('mcp connection missing');
      }
      return createToolServer(connection.context, connection.tools);
    },
    {
      legacy: 'stateless',
      onerror: (err) => container.logger.error('mcp handler error', { err }),
    },
  );

  const webRequest = async (request: FastifyRequest, reply: FastifyReply) => {
    const abort = new AbortController();
    reply.raw.on('close', () => {
      if (!reply.raw.writableFinished) {
        abort.abort();
      }
    });
    return toWebRequest(request.raw, request.body, { signal: abort.signal });
  };

  app.post('/mcp', { schema: { hide: true } }, async (request, reply) => {
    const grant = await container.auth.verifyAccess({
      method: request.method,
      url: container.mcp.resource,
      headers: request.headers,
    });
    if (!grant) {
      return reply.send(unauthorized(container.mcp));
    }
    let scope: OrgScope;
    try {
      scope = await resolveScopeFor(container, grant.userId, grant.orgId);
    } catch (error) {
      if (error instanceof NoActiveOrgError) {
        return reply.send(unauthorized(container.mcp));
      }
      throw error;
    }
    const connection: Connection = {
      context: { container, scope, requestId: request.id },
      tools: tools.filter((tool) => grant.scopes.includes(tool.scope) && roleHoldsScope(scope.role, tool.scope)),
    };
    const response = await handler.fetch(await webRequest(request, reply), {
      authInfo: { token: '', clientId: grant.clientId, scopes: grant.scopes, extra: { connection } },
      parsedBody: request.body,
    });
    return reply.send(response);
  });

  app.route({
    method: ['GET', 'DELETE'],
    url: '/mcp',
    schema: { hide: true },
    handler: async (_request, reply) =>
      reply
        .code(405)
        .header('allow', 'POST')
        .header('content-type', 'application/json')
        .send({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }),
  });
}
