// In-process event bus. Implements the shared EventBus port: publish invokes
// every handler subscribed to the event's type, sequentially, awaiting each,
// then every all-events handler (subscribeAll), also sequentially awaited.
// A failing handler does not stop the others; publish then rejects so the
// event is redelivered.
import type { DomainEvent, EventBus, EventDefinition } from "@headless-lms/core/shared/ports";

export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, Array<(e: DomainEvent) => Promise<void>>>();
  private readonly allHandlers: Array<(e: DomainEvent) => Promise<void>> = [];

  async publish(event: DomainEvent): Promise<void> {
    const errors: unknown[] = [];
    for (const handler of [...(this.handlers.get(event.type) ?? []), ...this.allHandlers]) {
      try {
        await handler(event);
      } catch (err) {
        errors.push(err);
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, `${errors.length} handlers failed for ${event.type}`);
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
