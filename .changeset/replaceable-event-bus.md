---
"@headless-lms/server": patch
---

An installation can supply its own event bus: `adapters.eventBus` takes an `EventBus`, or a factory given its logger, in place of the same-process `InMemoryEventBus`. The outbox relay publishes to it, the core subscribers are attached to it, and the container exposes it as `container.eventBus`. `EventBus`, `DomainEvent` and `EventDefinition` are exported from `@headless-lms/server`.
