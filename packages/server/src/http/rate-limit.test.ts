import { describe, expect, it, vi } from 'vitest';
import { fixedWindowLimit } from './rate-limit.js';

function clock(start = 1_000_000) {
  let at = start;
  return { now: () => at, advance: (ms: number) => (at += ms) };
}

describe('fixedWindowLimit', () => {
  it('lets a key through up to the maximum and then says how long to wait', () => {
    const time = clock();
    const limit = fixedWindowLimit({ windowSeconds: 10, max: 3, now: time.now });
    expect([limit('a'), limit('a'), limit('a')]).toEqual([null, null, null]);
    expect(limit('a')).toBe(10);
    time.advance(3500);
    expect(limit('a')).toBe(7);
  });

  it('counts each key on its own', () => {
    const limit = fixedWindowLimit({ windowSeconds: 10, max: 1, now: clock().now });
    expect(limit('a')).toBeNull();
    expect(limit('a')).not.toBeNull();
    expect(limit('b')).toBeNull();
  });

  it('starts over once the window has passed', () => {
    const time = clock();
    const limit = fixedWindowLimit({ windowSeconds: 10, max: 1, now: time.now });
    limit('a');
    expect(limit('a')).not.toBeNull();
    time.advance(10_000);
    expect(limit('a')).toBeNull();
    expect(limit('a')).toBe(10);
  });

  it('keeps counting a key that is still in its window after many others came and went', () => {
    const time = clock();
    const limit = fixedWindowLimit({ windowSeconds: 10, max: 1, now: time.now });
    for (let i = 0; i < 10_000; i++) {
      limit(`gone-${i}`);
    }
    time.advance(10_000);
    limit('kept');
    for (let i = 0; i < 10; i++) {
      limit(`new-${i}`);
    }
    expect(limit('kept')).not.toBeNull();
    expect(limit('gone-1')).toBeNull();
  });

  it('clears lapsed keys at most once per window, however many new keys arrive', () => {
    const time = clock();
    const limit = fixedWindowLimit({ windowSeconds: 10, max: 1, now: time.now });
    const deleted = vi.spyOn(Map.prototype, 'delete');
    for (let i = 0; i < 10_000; i++) {
      limit(`first-${i}`);
    }
    time.advance(10_000);
    for (let i = 0; i < 10_000; i++) {
      limit(`second-${i}`);
    }
    expect(deleted).toHaveBeenCalledTimes(10_000);
    time.advance(10_000);
    limit('third');
    expect(deleted).toHaveBeenCalledTimes(20_000);
    deleted.mockRestore();
  });
});
