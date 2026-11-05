import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { closeOnSignals } from './shutdown.js';

class FakeProcess extends EventEmitter {
  exit = vi.fn();
}

let app: FastifyInstance | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
});

async function until(check: () => boolean): Promise<void> {
  const end = Date.now() + 2000;
  while (!check()) {
    if (Date.now() > end) {
      throw new Error('timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('closeOnSignals', () => {
  it('closes the app on SIGTERM, running its close hooks, then exits 0', async () => {
    app = Fastify();
    const hooks: string[] = [];
    app.addHook('preClose', async () => {
      hooks.push('preClose');
    });
    app.addHook('onClose', async () => {
      hooks.push('onClose');
    });
    await app.ready();
    const proc = new FakeProcess();
    closeOnSignals(app, { process: proc as unknown as NodeJS.Process });
    proc.emit('SIGTERM', 'SIGTERM');
    await until(() => proc.exit.mock.calls.length > 0);
    expect(hooks).toEqual(['preClose', 'onClose']);
    expect(proc.exit).toHaveBeenCalledWith(0);
  });

  it('exits 1 at once on a second signal', async () => {
    app = Fastify();
    app.addHook('onClose', () => new Promise<void>(() => {}));
    await app.ready();
    const proc = new FakeProcess();
    closeOnSignals(app, { process: proc as unknown as NodeJS.Process });
    proc.emit('SIGINT', 'SIGINT');
    proc.emit('SIGINT', 'SIGINT');
    expect(proc.exit).toHaveBeenCalledWith(1);
    app = null;
  });

  it('exits 1 when closing outlasts the timeout', async () => {
    app = Fastify();
    app.addHook('onClose', () => new Promise<void>(() => {}));
    await app.ready();
    const proc = new FakeProcess();
    closeOnSignals(app, { process: proc as unknown as NodeJS.Process, timeoutMs: 20 });
    proc.emit('SIGTERM', 'SIGTERM');
    await until(() => proc.exit.mock.calls.length > 0);
    expect(proc.exit).toHaveBeenCalledWith(1);
    app = null;
  });
});
