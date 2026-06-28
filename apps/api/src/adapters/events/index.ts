// In-process event bus. Implements the shared EventBus port. Stub.
import type { DomainEvent, EventBus } from "../../core/shared/ports.js";

export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, Array<(e: DomainEvent) => Promise<void>>>();

  async publish(_event: DomainEvent): Promise<void> {
    throw new Error("not implemented");
  }

  subscribe(type: string, handler: (e: DomainEvent) => Promise<void>): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }
}
