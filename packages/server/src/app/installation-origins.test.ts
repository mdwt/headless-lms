import { describe, expect, it } from 'vitest';
import { installationOrigins } from './installation-origins.js';

const config = {
  adminAppUrl: 'https://admin.example.com/',
  authBaseURL: 'https://api.example.com/api/auth',
  trustedOrigins: ['https://admin.example.com', 'http://localhost:3100'],
};

describe("the installation's own origins", () => {
  it('are the admin app, the API and every listed web origin', () => {
    expect(installationOrigins(config)).toEqual([
      'https://admin.example.com',
      'https://api.example.com',
      'https://admin.example.com',
      'http://localhost:3100',
    ]);
  });

  it('leave out a listed origin that is not a web address', () => {
    expect(
      installationOrigins({ ...config, trustedOrigins: ['myapp://', '*.example.com'] }),
    ).toEqual(['https://admin.example.com', 'https://api.example.com']);
  });

  it.each(['', 'admin.example.com', 'localhost:8001'])(
    'name the setting when the admin address is %j',
    (adminAppUrl) => {
      expect(() => installationOrigins({ ...config, adminAppUrl })).toThrow(/ADMIN_APP_URL/);
    },
  );

  it('name the setting when the API address is not a web address', () => {
    expect(() => installationOrigins({ ...config, authBaseURL: 'api.example.com' })).toThrow(
      /BETTER_AUTH_URL/,
    );
  });
});
