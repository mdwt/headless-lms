import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Container } from '../app/container.js';
import type { ServerConfig } from './config.js';
import { registerCors } from './plugins/cors.js';
import { registerOpenApi } from './plugins/openapi.js';
import { registerAuth } from './plugins/auth.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerRoutes } from './routes.js';

export async function buildServer(
  config: ServerConfig,
  container: Container,
): Promise<FastifyInstance> {
  // One log stream for the whole process: HTTP shares the container's pino root.
  // Widened to FastifyBaseLogger so the instance keeps the default logger
  // generic (a concrete pino type would ripple through every plugin signature).
  const app = Fastify({
    loggerInstance: container.loggerInstance as FastifyBaseLogger,
  });

  // Enter the request-scoped log context: every line logged inside this
  // request's async scope carries its reqId (and orgId once resolveScope runs),
  // wherever it is emitted.
  app.addHook('onRequest', (request, _reply, done) => {
    container.requestContext.run({ reqId: request.id }, done);
  });

  // Validate + serialize request/response bodies from the shared Zod contract.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registerCors(app, config);
  registerOpenApi(app, config);
  registerAuth(app, container);
  registerErrorHandler(app);
  registerRoutes(app, container, config);

  // Drain + stop the outbox relay and the automation engine on shutdown.
  // Harmless when neither was started (gen-openapi boots this app with
  // ready() + close() only).
  app.addHook('onClose', async () => {
    await container.outboxRelay.stop();
    await container.automationEngine.stop();
  });

  return app;
}
