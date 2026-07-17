// In-process event bus. Implements the shared EventBus port: publish invokes
// every handler subscribed to the event's type, sequentially, awaiting each.
import type { DomainEvent, EventBus } from "../../core/shared/ports.js";

export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, Array<(e: DomainEvent) => Promise<void>>>();

  async publish(event: DomainEvent): Promise<void> {
    for (const handler of this.handlers.get(event.type) ?? []) {
      await handler(event);
    }
  }

  subscribe(type: string, handler: (e: DomainEvent) => Promise<void>): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }
}
