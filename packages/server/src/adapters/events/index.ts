// In-process event bus. Implements the shared EventBus port: publish invokes
// every handler subscribed to the event's type, sequentially, awaiting each,
// then every all-events handler (subscribeAll), also sequentially awaited.
import type { DomainEvent, EventBus } from '../../core/shared/ports.js';

export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, Array<(e: DomainEvent) => Promise<void>>>();
  private readonly allHandlers: Array<(e: DomainEvent) => Promise<void>> = [];

  async publish(event: DomainEvent): Promise<void> {
    for (const handler of this.handlers.get(event.type) ?? []) {
      await handler(event);
    }
    for (const handler of this.allHandlers) {
      await handler(event);
    }
  }

  subscribe(type: string, handler: (e: DomainEvent) => Promise<void>): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  subscribeAll(handler: (e: DomainEvent) => Promise<void>): void {
    this.allHandlers.push(handler);
  }
}
