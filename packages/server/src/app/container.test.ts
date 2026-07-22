import { describe, it, expect } from 'vitest';
import {
  LOGGING_DEFAULTS,
  OUTBOX_DEFAULTS,
  resolveLoggingConfig,
  resolveOutboxConfig,
} from './container.js';

describe('resolveOutboxConfig', () => {
  it('returns the spec defaults when no config is given', () => {
    expect(resolveOutboxConfig()).toEqual({
      enabled: true,
      pollIntervalMs: 1000,
      batchSize: 100,
    });
    expect(resolveOutboxConfig()).toEqual(OUTBOX_DEFAULTS);
  });

  it('merges partial overrides over the defaults', () => {
    const resolved = resolveOutboxConfig({ enabled: false, batchSize: 5 });
    expect(resolved.enabled).toBe(false);
    expect(resolved.batchSize).toBe(5);
    expect(resolved.pollIntervalMs).toBe(1000);
  });

  it('ignores explicit undefined values (defaults win)', () => {
    expect(resolveOutboxConfig({ pollIntervalMs: undefined }).pollIntervalMs).toBe(1000);
  });
});

describe('resolveLoggingConfig', () => {
  it('defaults to info', () => {
    expect(resolveLoggingConfig()).toEqual({ level: 'info' });
    expect(resolveLoggingConfig()).toEqual(LOGGING_DEFAULTS);
  });

  it('takes an explicit level', () => {
    expect(resolveLoggingConfig({ level: 'debug' }).level).toBe('debug');
  });

  it('ignores explicit undefined (default wins)', () => {
    expect(resolveLoggingConfig({ level: undefined }).level).toBe('info');
  });
});
