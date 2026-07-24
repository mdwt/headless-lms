import { describe, it, expect, vi } from 'vitest';
import type {
  AutomationActionResult,
  AutomationDispatch,
  AutomationExecutor,
} from '@headless-lms/types';
import { InlineAutomationEngine } from './index.js';

function dispatch(): AutomationDispatch {
  return {
    runId: 'run-1',
    orgId: 'org-1',
    automationId: 'automation-1',
    actions: [
      { type: 'sendEmail', input: { template: 'magicLink' } },
      { type: 'sendEmail', input: { template: 'magicLink' } },
    ],
    event: { type: 'student.enrolled' } as AutomationDispatch['event'],
  };
}

describe('InlineAutomationEngine', () => {
  it('runs all actions in order and finalizes with all-completed results', async () => {
    const engine = new InlineAutomationEngine();
    const order: number[] = [];
    const results: AutomationActionResult[] = [
      { index: 0, type: 'sendEmail', status: 'completed' },
      { index: 1, type: 'sendEmail', status: 'completed' },
    ];
    const executor: AutomationExecutor = {
      runAction: vi.fn(async (_d: AutomationDispatch, index: number) => {
        order.push(index);
        return results[index]!;
      }),
      finalize: vi.fn(async () => {}),
    };
    engine.register(executor);

    const d = dispatch();
    await engine.dispatch(d);

    expect(order).toEqual([0, 1]);
    expect(executor.runAction).toHaveBeenCalledTimes(2);
    expect(executor.runAction).toHaveBeenNthCalledWith(1, d, 0);
    expect(executor.runAction).toHaveBeenNthCalledWith(2, d, 1);
    expect(executor.finalize).toHaveBeenCalledTimes(1);
    expect(executor.finalize).toHaveBeenCalledWith(d, results);
  });

  it('stops after a throwing action and finalizes once with completed-then-failed results', async () => {
    const engine = new InlineAutomationEngine();
    const executor: AutomationExecutor = {
      runAction: vi.fn(async (_d: AutomationDispatch, index: number): Promise<AutomationActionResult> => {
        if (index === 0) {
          return { index: 0, type: 'sendEmail', status: 'completed' };
        }
        throw new Error('boom');
      }),
      finalize: vi.fn(async () => {}),
    };
    engine.register(executor);

    const d: AutomationDispatch = {
      ...dispatch(),
      actions: [
        { type: 'sendEmail', input: { template: 'magicLink' } },
        { type: 'sendEmail', input: { template: 'magicLink' } },
        { type: 'sendEmail', input: { template: 'magicLink' } },
      ],
    };
    await engine.dispatch(d);

    expect(executor.runAction).toHaveBeenCalledTimes(2);
    expect(executor.finalize).toHaveBeenCalledTimes(1);
    expect(executor.finalize).toHaveBeenCalledWith(d, [
      { index: 0, type: 'sendEmail', status: 'completed' },
      { index: 1, type: 'sendEmail', status: 'failed', error: 'boom' },
    ]);
  });

  it('passes the same dispatch object reference to finalize', async () => {
    const engine = new InlineAutomationEngine();
    let seen: AutomationDispatch | undefined;
    const executor: AutomationExecutor = {
      runAction: vi.fn(async (_d, index) => ({
        index,
        type: 'sendEmail' as const,
        status: 'completed' as const,
      })),
      finalize: vi.fn(async (d) => {
        seen = d;
      }),
    };
    engine.register(executor);

    const d = dispatch();
    await engine.dispatch(d);

    expect(seen).toBe(d);
  });

  it('throws when dispatch is called before register', async () => {
    const engine = new InlineAutomationEngine();
    await expect(engine.dispatch(dispatch())).rejects.toThrow();
  });

  it('start and stop resolve as no-ops', async () => {
    const engine = new InlineAutomationEngine();
    await expect(engine.start()).resolves.toBeUndefined();
    await expect(engine.stop()).resolves.toBeUndefined();
  });
});
