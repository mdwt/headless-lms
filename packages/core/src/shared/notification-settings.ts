import type { NotificationCategory, StoredSetting } from '../types/index.js';

export type ChannelSource = 'locked' | 'space' | 'community' | 'spaceDefault' | 'default';

export interface ResolvedChannel {
  channel: string;
  enabled: boolean;
  source: ChannelSource;
  locked: boolean;
}

export function resolveChannels(
  category: NotificationCategory,
  settings: StoredSetting[],
  spaceId: string | null,
  configured: string[],
): ResolvedChannel[] {
  const perSpace = category.perSpace === true;
  const ownSettings = settings.filter((s) => s.category === category.key);
  const resolved: ResolvedChannel[] = [];
  for (const channel of configured) {
    const offered = category.channels[channel];
    if (!offered) {
      continue;
    }
    if (offered.locked) {
      resolved.push({ channel, enabled: offered.default, source: 'locked', locked: true });
      continue;
    }
    const forChannel = ownSettings.filter((s) => s.channel === channel);
    const spaceSetting =
      perSpace && spaceId !== null ? forChannel.find((s) => s.spaceId === spaceId) : undefined;
    if (spaceSetting) {
      resolved.push({ channel, enabled: spaceSetting.enabled, source: 'space', locked: false });
      continue;
    }
    const communitySetting = forChannel.find((s) => s.spaceId === null);
    if (communitySetting) {
      resolved.push({
        channel,
        enabled: communitySetting.enabled,
        source: 'community',
        locked: false,
      });
      continue;
    }
    const spaceDefault =
      perSpace && spaceId !== null ? category.spaceDefaults?.[spaceId]?.[channel] : undefined;
    if (spaceDefault !== undefined) {
      resolved.push({ channel, enabled: spaceDefault, source: 'spaceDefault', locked: false });
      continue;
    }
    resolved.push({ channel, enabled: offered.default, source: 'default', locked: false });
  }
  return resolved;
}
