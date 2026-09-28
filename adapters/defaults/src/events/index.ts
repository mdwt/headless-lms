// In-process event bus. Implements the shared EventBus port: publish invokes
// every handler subscribed to the event's type, sequentially, awaiting each,
// then every all-events handler (subscribeAll), also sequentially awaited.
import type { DomainEvent, EventBus, EventDefinition } from "@headless-lms/core/shared/ports";

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

  subscribe<E extends DomainEvent>(
    definition: EventDefinition<E>,
    handler: (e: E) => Promise<void>,
  ): void;
  subscribe(type: string, handler: (e: DomainEvent) => Promise<void>): void;
  subscribe(
    typeOrDefinition: string | EventDefinition<DomainEvent>,
    handler: (e: DomainEvent) => Promise<void>,
  ): void {
    const type = typeof typeOrDefinition === "string" ? typeOrDefinition : typeOrDefinition.type;
    const parsedHandler =
      typeof typeOrDefinition === "string"
        ? handler
        : async (event: DomainEvent) => handler(typeOrDefinition.parse(event));
    const list = this.handlers.get(type) ?? [];
    list.push(parsedHandler);
    this.handlers.set(type, list);
  }

  subscribeAll(handler: (e: DomainEvent) => Promise<void>): void {
    this.allHandlers.push(handler);
  }
}
