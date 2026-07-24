// Default in-process engine — runs a dispatched automation immediately, one
// attempt per action; durable engines (Hatchet, …) are installation adapters.
import type {
  AutomationActionResult,
  AutomationDispatch,
  AutomationEngine,
  AutomationExecutor,
} from '@headless-lms/types';

export class InlineAutomationEngine implements AutomationEngine {
  private executor: AutomationExecutor | undefined;

  register(executor: AutomationExecutor): void {
    this.executor = executor;
  }

  async dispatch(d: AutomationDispatch): Promise<void> {
    if (!this.executor) {
      throw new Error('InlineAutomationEngine.dispatch called before register()');
    }
    const executor = this.executor;

    const results: AutomationActionResult[] = [];
    for (let index = 0; index < d.actions.length; index++) {
      try {
        results.push(await executor.runAction(d, index));
      } catch (err) {
        const message = (err as { message?: unknown } | undefined)?.message ?? err;
        results.push({ index, type: d.actions[index]!.type, status: 'failed', error: String(message) });
        break;
      }
    }

    await executor.finalize(d, results);
  }

  async start(): Promise<void> {}

  async stop(): Promise<void> {}
}
