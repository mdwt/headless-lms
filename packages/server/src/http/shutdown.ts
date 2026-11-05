import type { FastifyInstance } from 'fastify';

export interface CloseOnSignalsOptions {
  signals?: NodeJS.Signals[];
  timeoutMs?: number;
  process?: Pick<NodeJS.Process, 'on' | 'exit'>;
}

export function closeOnSignals(app: FastifyInstance, options: CloseOnSignalsOptions = {}): void {
  const proc = options.process ?? process;
  const timeoutMs = options.timeoutMs ?? 10_000;
  let closing = false;
  const onSignal = (signal: NodeJS.Signals) => {
    if (closing) {
      app.log.warn({ signal }, 'second signal; exiting without finishing shutdown');
      proc.exit(1);
      return;
    }
    closing = true;
    app.log.info({ signal }, 'shutting down');
    const timer = setTimeout(() => {
      app.log.error({ signal, timeoutMs }, 'shutdown timed out; exiting');
      proc.exit(1);
    }, timeoutMs);
    timer.unref();
    app.close().then(
      () => {
        clearTimeout(timer);
        app.log.info({ signal }, 'shut down');
        proc.exit(0);
      },
      (err: unknown) => {
        clearTimeout(timer);
        app.log.error({ err, signal }, 'shutdown failed');
        proc.exit(1);
      },
    );
  };
  for (const signal of options.signals ?? ['SIGTERM', 'SIGINT']) {
    proc.on(signal, onSignal);
  }
}
