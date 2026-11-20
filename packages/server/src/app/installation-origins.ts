import { webOrigin } from '@headless-lms/core/shared/network';

function required(name: string, value: string): string {
  const origin = webOrigin(value);
  if (!origin) {
    throw new Error(`${name} must be an address such as https://example.com, got "${value}"`);
  }
  return origin;
}

export function installationOrigins(config: {
  adminAppUrl: string;
  authBaseURL: string;
  trustedOrigins: readonly string[];
}): string[] {
  return [
    required('ADMIN_APP_URL (adminAppUrl)', config.adminAppUrl),
    required('BETTER_AUTH_URL (authBaseURL)', config.authBaseURL),
    ...config.trustedOrigins.map(webOrigin).filter((origin) => origin !== null),
  ];
}
