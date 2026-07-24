import { describe, it, expect } from 'vitest';
import { InMemoryEventBus } from './index.js';
import type { DomainEvent } from '../../core/shared/ports.js';

function event(type: string, id: string): DomainEvent {
  return { type, id, orgId: 'org-1', createdAt: '2026-07-22T00:00:00.000Z' } as DomainEvent;
}

describe('InMemoryEventBus.subscribeAll', () => {
  it('receives events of any type', async () => {
    const bus = new InMemoryEventBus();
    const seen: string[] = [];
    bus.subscribeAll(async (e) => {
      seen.push(e.type);
    });
    await bus.publish(event('entitlement.created', 'evt_1'));
    await bus.publish(event('automation.created', 'evt_2'));
    expect(seen).toEqual(['entitlement.created', 'automation.created']);
  });

  it('runs after the type-specific handlers, in order', async () => {
    const bus = new InMemoryEventBus();
    const order: string[] = [];
    bus.subscribe('entitlement.created', async () => {
      order.push('type-specific');
    });
    bus.subscribeAll(async () => {
      order.push('all');
    });
    await bus.publish(event('entitlement.created', 'evt_1'));
    expect(order).toEqual(['type-specific', 'all']);
  });

  it('runs every all-events handler, sequentially, in subscription order', async () => {
    const bus = new InMemoryEventBus();
    const order: string[] = [];
    bus.subscribeAll(async () => {
      order.push('first');
    });
    bus.subscribeAll(async () => {
      order.push('second');
    });
    await bus.publish(event('entitlement.created', 'evt_1'));
    expect(order).toEqual(['first', 'second']);
  });

  it('propagates errors thrown by an all-events handler, like a type-specific handler', async () => {
    const bus = new InMemoryEventBus();
    bus.subscribeAll(async () => {
      throw new Error('boom');
    });
    await expect(bus.publish(event('entitlement.created', 'evt_1'))).rejects.toThrow('boom');
  });

  it('stops dispatching to later handlers once one throws', async () => {
    const bus = new InMemoryEventBus();
    const seen: string[] = [];
    bus.subscribe('entitlement.created', async () => {
      seen.push('type-specific');
    });
    bus.subscribeAll(async () => {
      seen.push('all-1');
      throw new Error('boom');
    });
    bus.subscribeAll(async () => {
      seen.push('all-2');
    });
    await expect(bus.publish(event('entitlement.created', 'evt_1'))).rejects.toThrow('boom');
    expect(seen).toEqual(['type-specific', 'all-1']);
  });
});
