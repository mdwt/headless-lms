import { beforeAll, describe, expect, it } from 'vitest';
import {
  openStream,
  startInstance,
  stop,
  type Instance,
  type LiveEnv,
  type Member,
  type World,
} from './harness.js';

export function access(env: () => LiveEnv): void {
  describe('access', () => {
    let a: Instance;
    let world: World;

    beforeAll(() => {
      ({ a, world } = env());
    });

    const connect = (member: Member | null) => openStream(a, member, world.communityId);

    it('refuses no cookie with 401, a member of another community with 403, and a server without PubSub with 503', async () => {
      expect((await connect(null)).status).toBe(401);

      const henry = await world.join('Henry', { community: world.otherCommunityId });
      expect((await connect(henry)).status).toBe(403);

      const c = await startInstance('C', { pubsub: false });
      try {
        const refused = await openStream(c, henry, world.otherCommunityId);
        expect(refused.status).toBe(503);
        expect(c.container.pubsub).toBeNull();
        expect(c.container.chatHub).toBeNull();
      } finally {
        await stop(c);
      }
    });
  });
}
