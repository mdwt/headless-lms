import { afterAll, beforeAll, describe } from 'vitest';
import { DATABASE_URL, startEnv, stop, type LiveEnv } from './harness.js';
import { access } from './access.js';
import { contract } from './contract.js';
import { twoInstances } from './two-instances.js';

describe.skipIf(!DATABASE_URL)('live chat', () => {
  let env: LiveEnv;

  beforeAll(async () => {
    env = await startEnv();
  }, 60_000);

  afterAll(async () => {
    await stop(env.a, env.b);
  }, 20_000);

  twoInstances(() => env);
  access(() => env);
  contract(() => env);
});
