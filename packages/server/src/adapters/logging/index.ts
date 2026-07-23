// Logging adapter — implements the core Logger port over pino. One root
// instance per process: the container creates it, Fastify reuses it via
// `loggerInstance`, and every component gets a child bound with { name }.
import { pino, stdSerializers, type DestinationStream, type Logger as PinoInstance } from 'pino';
import type { Logger } from '../../core/shared/ports.js';
import { requestLogContext } from './request-context.js';

export { requestLogContext, type RequestLogContext } from './request-context.js';
export type { PinoInstance };

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class PinoLogger implements Logger {
  constructor(private readonly instance: PinoInstance) {}

  debug(msg: string, meta?: Record<string, unknown>): void {
    this.instance.debug(meta ?? {}, msg);
  }
  info(msg: string, meta?: Record<string, unknown>): void {
    this.instance.info(meta ?? {}, msg);
  }
  warn(msg: string, meta?: Record<string, unknown>): void {
    this.instance.warn(meta ?? {}, msg);
  }
  error(msg: string, meta?: Record<string, unknown>): void {
    this.instance.error(meta ?? {}, msg);
  }
  child(bindings: Record<string, unknown>): Logger {
    return new PinoLogger(this.instance.child(bindings));
  }
}

/** The process-wide root: JSON lines, Error serialization under `err`.
 *  `destination` exists for tests; omitted → stdout. */
export function createRootLogger(
  level: LogLevel,
  destination?: DestinationStream,
): { instance: PinoInstance; logger: Logger } {
  const instance = pino(
    {
      level,
      serializers: { err: stdSerializers.err },
      // Ambient request correlation (reqId/orgId); call-site meta wins on clash.
      mixin: () => requestLogContext.current(),
    },
    destination,
  );
  return { instance, logger: new PinoLogger(instance) };
}
