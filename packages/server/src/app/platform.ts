import { createHash, timingSafeEqual } from 'node:crypto';

export const PLATFORM_KEY_MIN_LENGTH = 32;

export interface PlatformConfig {
  key: string;
  accountEmail: string;
  accountName?: string;
}

export interface PlatformKeyCheck {
  matches(candidate: string): boolean;
}

const digest = (value: string) => createHash('sha256').update(value).digest();

export function platformKeyCheck(config: PlatformConfig): PlatformKeyCheck {
  if (config.key.length < PLATFORM_KEY_MIN_LENGTH) {
    throw new Error(`the platform key must be at least ${PLATFORM_KEY_MIN_LENGTH} characters`);
  }
  if (!config.accountEmail.includes('@')) {
    throw new Error('the platform account needs an email address');
  }
  const expected = digest(config.key);
  return { matches: (candidate) => timingSafeEqual(digest(candidate), expected) };
}
