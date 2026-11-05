import { afterEach, describe, expect, it } from 'vitest';
import { connect, type Socket } from 'node:net';
import Fastify, { type FastifyInstance } from 'fastify';
import { sse, type SseOptions } from './sse.js';

type Event = { type: string; body?: string };

class Source implements AsyncIterableIterator<Event> {
  returned = false;
  private queue: Event[] = [];
  private waiter: ((result: IteratorResult<Event>) => void) | null = null;

  push(event: Event): void {
    const waiter = this.waiter;
    if (waiter) {
      this.waiter = null;
      waiter({ value: event, done: false });
      return;
    }
    this.queue.push(event);
  }

  next(): Promise<IteratorResult<Event>> {
    const event = this.queue.shift();
    if (event) {
      return Promise.resolve({ value: event, done: false });
    }
    if (this.returned) {
      return Promise.resolve({ value: undefined, done: true });
    }
    return new Promise((resolve) => {
      this.waiter = resolve;
    });
  }

  return(): Promise<IteratorResult<Event>> {
    this.returned = true;
    this.waiter?.({ value: undefined, done: true });
    this.waiter = null;
    return Promise.resolve({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<Event> {
    return this;
  }
}

let app: FastifyInstance | null = null;
let socket: Socket | null = null;
let logs: Array<Record<string, unknown>> = [];

afterEach(async () => {
  socket?.destroy();
  socket = null;
  await app?.close();
  app = null;
  logs = [];
});

async function serve(source: Source, options: SseOptions): Promise<number> {
  app = Fastify({
    logger: {
      level: 'info',
      stream: { write: (line: string) => logs.push(JSON.parse(line) as Record<string, unknown>) },
    },
  });
  app.get('/events', async (_req, reply) => {
    await sse(reply, source, options);
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  return typeof address === 'object' && address ? address.port : 0;
}

function open(port: number, read: boolean): { text: () => string; closed: Promise<void> } {
  let text = '';
  socket = connect(port, '127.0.0.1');
  socket.setEncoding('utf8');
  if (read) {
    socket.on('data', (chunk: string) => {
      text += chunk;
    });
  } else {
    socket.pause();
  }
  const closed = new Promise<void>((resolve) => socket!.on('close', () => resolve()));
  socket.write('GET /events HTTP/1.1\r\nHost: localhost\r\n\r\n');
  return { text: () => text, closed };
}

const completed = () => logs.filter((line) => line['msg'] === 'event stream ended');

async function until(check: () => boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) {
      throw new Error('timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('sse', () => {
  it('writes a ping comment on the interval and ends the source when the client leaves', async () => {
    const source = new Source();
    const port = await serve(source, { pingMs: 50 });
    const client = open(port, true);
    source.push({ type: 'ready' });
    await until(() => client.text().includes(': ping\n\n'));
    expect(client.text()).toContain('event: ready\ndata: {"type":"ready"}\n\n');
    socket!.destroy();
    await until(() => source.returned);
    await until(() => completed().length === 1);
    expect(completed()[0]).toMatchObject({ ended: 'client', events: 1 });
    expect(typeof completed()[0]!['responseTime']).toBe('number');
  });

  it('ends the response when the source ends', async () => {
    const source = new Source();
    const port = await serve(source, {});
    const client = open(port, true);
    source.push({ type: 'closed' });
    await until(() => client.text().includes('event: closed'));
    void source.return();
    await until(() => client.text().endsWith('0\r\n\r\n'));
    await until(() => completed().length === 1);
    expect(completed()[0]).toMatchObject({ ended: 'server', events: 1 });
  });

  it('ends a stream whose client stops reading once a write stays undrained', async () => {
    const source = new Source();
    const port = await serve(source, { drainTimeoutMs: 300, pingMs: 60_000 });
    const client = open(port, false);
    const body = 'x'.repeat(1024 * 1024);
    const started = Date.now();
    const pushing = setInterval(() => {
      if (!source.returned) {
        source.push({ type: 'message.created', body });
      }
    }, 5);
    await until(() => source.returned, 10_000);
    clearInterval(pushing);
    expect(Date.now() - started).toBeLessThan(10_000);
    socket!.resume();
    await client.closed;
    await until(() => completed().length === 1);
    expect(completed()[0]).toMatchObject({ ended: 'undrained' });
  }, 20_000);
});
