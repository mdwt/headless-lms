import { describe, expect, it } from 'vitest';
import { EditMessage, SendMessage, StartDirectChat, StartGroupChat } from './chats.js';
import {
  CreateCommunity,
  PatchCommunitySettings,
  PatchDmSettings,
  SetSpaceTopics,
} from './community.js';
import { CreatePost, SchedulePost } from './posts.js';
import { UpdateProfile, UserProfile } from './profile.js';
import { RequestMemberUpload } from './assets.js';

const AT = new Date('2026-10-29T12:00:00Z');

describe('request limits', () => {
  it('edits a message under the same rules it was sent with', () => {
    expect(EditMessage.parse({ body: '  hi  ' })).toEqual({ body: 'hi' });
    expect(SendMessage.parse({ body: '  hi  ' }).body).toBe('hi');
    for (const body of ['   ', 'x'.repeat(10_001)]) {
      expect(EditMessage.safeParse({ body }).success).toBe(false);
      expect(SendMessage.safeParse({ body }).success).toBe(false);
    }
  });

  it('caps attachments, group invitees and ids', () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `ast_${i}`);
    const direct = { communityId: 'cmy_1', orgUserId: 'ou_1', body: 'hi' };
    expect(StartDirectChat.safeParse({ ...direct, assetIds: ids(10) }).success).toBe(true);
    expect(StartDirectChat.safeParse({ ...direct, assetIds: ids(11) }).success).toBe(false);
    expect(StartDirectChat.safeParse({ ...direct, orgUserId: ' ' }).success).toBe(false);
    expect(StartGroupChat.safeParse({ communityId: 'cmy_1', orgUserIds: ids(100) }).success).toBe(
      false,
    );
  });

  it('bounds community, topic and direct-message settings input', () => {
    expect(CreateCommunity.safeParse({ title: 'x'.repeat(201) }).success).toBe(false);
    expect(SetSpaceTopics.parse({ topics: [{ name: '  Wins ' }] }).topics[0]!.name).toBe('Wins');
    expect(SetSpaceTopics.safeParse({ topics: [{ name: 'x'.repeat(61) }] }).success).toBe(false);
    expect(PatchDmSettings.safeParse({ groupSize: 101 }).success).toBe(false);
    expect(PatchDmSettings.safeParse({ groupSize: 8 }).success).toBe(true);
  });

  it('accepts a digest schedule in a valid IANA zone, or null, beside the direct-message settings', () => {
    const digest = { cadence: 'weekly', weekday: 4, hour: 7, timeZone: 'Europe/Madrid' };
    expect(PatchCommunitySettings.parse({ digest, groupSize: 8 })).toEqual({
      digest,
      groupSize: 8,
    });
    expect(PatchCommunitySettings.parse({ digest: null })).toEqual({ digest: null });
    expect(PatchCommunitySettings.parse({ digest: { ...digest, cadence: 'daily' } })).toEqual({
      digest: { ...digest, cadence: 'daily' },
    });
    for (const bad of [
      { ...digest, cadence: 'monthly' },
      { ...digest, weekday: 7 },
      { ...digest, weekday: -1 },
      { ...digest, hour: 24 },
      { ...digest, hour: 7.5 },
      { ...digest, timeZone: 'Mars/Olympus' },
      { ...digest, timeZone: '' },
      { cadence: 'daily', hour: 7, timeZone: 'UTC' },
      { ...digest, extra: true },
    ]) {
      expect(PatchCommunitySettings.safeParse({ digest: bad }).success).toBe(false);
    }
  });

  it('reads post dates as RFC 3339 date-times only', () => {
    const post = {
      title: 'Hello',
      body: '',
      topicId: null,
      coverAssetId: null,
      mode: 'schedule',
      scheduledAt: '2026-10-29T14:00:00+02:00',
    };
    expect(CreatePost.parse(post).scheduledAt).toEqual(AT);
    expect(CreatePost.safeParse({ ...post, scheduledAt: 0 }).success).toBe(false);
    expect(SchedulePost.safeParse({ scheduledAt: 'tomorrow' }).success).toBe(false);
  });

  it('caps the free-form extra JSON on posts and profiles', () => {
    const big = { notes: 'x'.repeat(16 * 1024) };
    expect(UpdateProfile.safeParse({ extra: big }).success).toBe(false);
    expect(UpdateProfile.safeParse({ extra: { notes: 'short' } }).success).toBe(true);
    expect(
      CreatePost.safeParse({
        title: 'Hello',
        body: '',
        topicId: null,
        coverAssetId: null,
        mode: 'draft',
        scheduledAt: null,
        extra: big,
      }).success,
    ).toBe(false);
  });

  it('caps upload filenames', () => {
    const upload = { contentType: 'image/png' };
    expect(RequestMemberUpload.safeParse({ ...upload, filename: 'a.png' }).success).toBe(true);
    expect(RequestMemberUpload.safeParse({ ...upload, filename: 'x'.repeat(256) }).success).toBe(
      false,
    );
  });

  it('keeps the org of a profile photo out of the profile', () => {
    const profile = UserProfile.parse({
      userId: 'usr_1',
      displayName: null,
      headline: null,
      bio: null,
      imageAssetOrgId: 'org_1',
      imageAssetId: null,
      imageUrl: null,
      extra: {},
      createdAt: AT,
      updatedAt: AT,
    });
    expect(profile).not.toHaveProperty('imageAssetOrgId');
  });
});
