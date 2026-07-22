import { describe, it, expect } from 'vitest';
import { roles } from './access.js';

describe('auth access control', () => {
  it('defines exactly the four domain roles', () => {
    expect(Object.keys(roles).sort()).toEqual(['admin', 'instructor', 'owner', 'student']);
  });
});
