import type { FastifyInstance, FastifyReply } from 'fastify';

const PING_MS = 25_000;
const DRAIN_TIMEOUT_MS = 30_000;

export interface EventStreams {
  /** Resolves once every event stream request in flight has finished, or after `timeoutMs`. */
  settled(timeoutMs: number): Promise<void>;
}

/** Tracks the requests to routes marked `config.eventStream`, from routing to
 *  the end of their response. */
export function trackEventStreams(app: FastifyInstance): EventStreams {
  const open = new Set<Promise<void>>();
  app.addHook('onRequest', async (req, reply) => {
    if (!req.routeOptions.config.eventStream) {
      return;
    }
    const closed = new Promise<void>((resolve) => reply.raw.once('close', () => resolve()));
    open.add(closed);
    void closed.then(() => open.delete(closed));
  });
  return {
    async settled(timeoutMs) {
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        Promise.all(open),
        new Promise((resolve) => {
          timer = setTimeout(resolve, timeoutMs);
        }),
      ]);
      clearTimeout(timer);
    },
  };
}

export interface SseOptions {
  pingMs?: number;
  drainTimeoutMs?: number;
}

export async function sse<T extends { type: string }>(
  reply: FastifyReply,
  events: AsyncIterable<T>,
  options: SseOptions = {},
): Promise<void> {
  const pingMs = options.pingMs ?? PING_MS;
  const drainTimeoutMs = options.drainTimeoutMs ?? DRAIN_TIMEOUT_MS;
  const res = reply.raw;
  const iterator = events[Symbol.asyncIterator]();

  reply.hijack();
  const set = Object.entries(reply.getHeaders()).filter(
    (entry): entry is [string, string | number | string[]] => entry[1] !== undefined,
  );
  res.writeHead(200, {
    ...Object.fromEntries(set),
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    'x-accel-buffering': 'no',
  });
  res.flushHeaders();

  let closed = false;
  let draining = false;
  let ended: 'client' | 'server' | 'undrained' | 'error' = 'client';
  let sent = 0;
  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    clearInterval(ping);
    void iterator.return?.();
  };
  res.on('close', close);

  const write = async (chunk: string): Promise<boolean> => {
    if (closed) {
      return false;
    }
    if (res.write(chunk)) {
      return true;
    }
    draining = true;
    const drained = await new Promise<boolean>((resolve) => {
      const done = (ok: boolean) => {
        clearTimeout(timer);
        res.off('drain', onDrain);
        res.off('close', onClose);
        resolve(ok);
      };
      const onDrain = () => done(true);
      const onClose = () => done(false);
      const timer = setTimeout(() => done(false), drainTimeoutMs);
      res.on('drain', onDrain);
      res.on('close', onClose);
    });
    draining = false;
    if (!drained && !closed) {
      ended = 'undrained';
      reply.log.warn('event stream not drained; closing it');
      close();
      res.destroy();
    }
    return drained;
  };

  const ping = setInterval(() => {
    if (!draining) {
      void write(': ping\n\n');
    }
  }, pingMs);
  ping.unref();

  try {
    while (!closed) {
      const next = await iterator.next();
      if (next.done) {
        if (!closed) {
          ended = 'server';
        }
        break;
      }
      const event = next.value;
      // The generated SDK client yields only `data`, so it carries `type` too.
      if (!(await write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`))) {
        break;
      }
      sent += 1;
    }
  } catch (error) {
    ended = 'error';
    reply.log.error({ err: error }, 'event stream failed');
  } finally {
    close();
    if (!res.destroyed && !res.writableEnded) {
      res.end();
    }
    reply.log.info({ responseTime: reply.elapsedTime, ended, events: sent }, 'event stream ended');
  }
}
