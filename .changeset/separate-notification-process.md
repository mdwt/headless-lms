---
"@headless-lms/core": minor
"@headless-lms/server": patch
"@headless-lms/adapter-defaults": patch
"@headless-lms/adapter-workflow-hatchet": patch
---

The notification process runs apart from org automations. It has its own event bus subscriber, so a notification failure no longer fails the automations handler, and notifications no longer wait for automations to be dispatched. Notification deliveries have their own executor: `AutomationExecutor` no longer has `runDelivery`; an `AutomationEngine` takes a `DeliveryExecutor` through `registerDeliveries`, and `NotificationDelivery` implements it (`run` is now `runDelivery`). `AutomationsServiceImpl` no longer takes `delivery` or `processor`. `InMemoryEventBus` runs every handler even when one throws, then rejects with that error, or an `AggregateError` when several fail, so the outbox redelivers the event.
