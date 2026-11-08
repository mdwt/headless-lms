import { describe, it, expect } from 'vitest';
import { DiscussionServiceImpl, DEFAULT_SETTINGS } from './service.js';
import type {
  Actor,
  ActivityGetter,
  AuthorPermissionReader,
  AuthorRecord,
  CommentReactions,
  CommentWithContext,
  ContentAccessReader,
  DiscussionRepository,
  DiscussionUnitOfWork,
  MentionsRepository,
} from './ports.js';
import type { ActivityCommentsRule, Comment, CommentReport, CommentSettings } from './model.js';
import type { NewDiscussionEvent } from './events.js';
import type { ListCommentsQuery, ReactionEmoji } from './types.js';
import { createFileUrls } from '../assets/index.js';
import { actorWith, type ActorShape } from '../organizations/index.js';
import type { PostStatus } from '../types/index.js';
import { ConflictError, NotFoundError, ForbiddenError } from '../shared/errors.js';
import {
  SettingsNamespace,
  SettingsService,
  type SettingsRecord,
  type SettingsRepository,
} from '../shared/settings.js';

const fileUrls = createFileUrls('https://api.test');

function mentionStore() {
  const rows: { itemType: string; itemId: string; orgUserId: string; createdAt: Date }[] = [];
  const of = (itemType: string, itemId: string) =>
    rows.filter((row) => row.itemType === itemType && row.itemId === itemId);
  const repo: MentionsRepository = {
    async ofItem(_orgId, itemType, itemId) {
      return of(itemType, itemId).map((row) => row.orgUserId);
    },
    async forItems(_orgId, itemType, itemIds) {
      return Object.fromEntries(
        itemIds
          .map((itemId) => [itemId, of(itemType, itemId).map((row) => row.orgUserId)] as const)
          .filter(([, people]) => people.length > 0),
      );
    },
    async sync(_orgId, itemType, itemId, orgUserIds, at) {
      for (const row of of(itemType, itemId)) {
        if (!orgUserIds.includes(row.orgUserId)) {
          rows.splice(rows.indexOf(row), 1);
        }
      }
      const before = of(itemType, itemId).map((row) => row.orgUserId);
      const added = orgUserIds.filter((orgUserId) => !before.includes(orgUserId));
      rows.push(...added.map((orgUserId) => ({ itemType, itemId, orgUserId, createdAt: at })));
      return added;
    },
    async removeItem(_orgId, itemType, itemId) {
      for (const row of of(itemType, itemId)) {
        rows.splice(rows.indexOf(row), 1);
      }
    },
  };
  return { rows, repo };
}

function photo(id: string, imageAssetId: string): AuthorRecord {
  return {
    id,
    firstName: id,
    lastName: null,
    image: null,
    email: `${id}@example.test`,
    displayName: null,
    headline: null,
    imageAssetOrgId: 'o1',
    imageAssetId,
  };
}

function q(filters: Partial<ListCommentsQuery> = {}): ListCommentsQuery {
  return { page: 1, pageSize: 20, ...filters };
}

const INSTRUCTOR = { key: 'instructor', name: 'Instructor', team: true };
const MODERATOR = { key: 'moderator', name: 'Moderator', team: true };

/** Everyone a test acts as, so the fake permission reader can resolve them
 *  as other people too. */
const people = new Map<string, Actor>();

function person(shape: ActorShape & { id: string }): Actor {
  const actor = actorWith({ orgId: 'o1', ...shape });
  people.set(actor.id, actor);
  return actor;
}

const learner = person({ id: 'ou_learner' });
const other = person({ id: 'ou_other' });
/** Moderates the lesson comments of c1, and nothing else. */
const staff = person({
  id: 'ou_staff',
  content: { c1: ['courses:moderate'] },
  contentRoles: { c1: INSTRUCTOR },
});
/** Moderates the lesson comments of c2 only. */
const elsewhere = person({
  id: 'ou_elsewhere',
  content: { c2: ['courses:moderate'] },
  contentRoles: { c2: INSTRUCTOR },
});
/** Moderates the lesson comments of every course. */
const moderator = person({ id: 'ou_moderator', org: ['courses:moderate'] });
/** Moderates the community cmy_1. */
const communityMod = person({
  id: 'ou_mod',
  content: { cmy_1: ['communities:moderate'] },
  contentRoles: { cmy_1: MODERATOR },
});
const admin = person({ id: 'ou_admin', org: ['courses:moderate', 'communities:moderate'] });
const outsider = person({ id: 'ou_out' });

export function fakeAuthors(): AuthorPermissionReader {
  return {
    async permissionsOfMany(_orgId, orgUserIds) {
      return new Map(
        orgUserIds.map((id) => [id, (people.get(id) ?? actorWith({ id })).permissions]),
      );
    },
    async actorFor(_orgId, orgUserId) {
      return people.get(orgUserId) ?? null;
    },
    systemActor: (orgId) => actorWith({ owner: true, id: 'system', orgId }),
  };
}

/** Every activity belongs to course c1 unless a test says otherwise. */
export function fakeRepo() {
  const comments: Comment[] = [];
  const reactions: { commentId: string; orgUserId: string; type: ReactionEmoji }[] = [];
  const reports: CommentReport[] = [];
  const authors = new Map<string, AuthorRecord>();
  const activityCourse = new Map<string, string>([
    ['a1', 'c1'],
    ['a2', 'c1'],
    ['b1', 'c2'],
  ]);
  const activityTitle = new Map<string, string>([
    ['a1', 'Lesson one'],
    ['a2', 'Lesson two'],
    ['b1', 'Grammar one'],
  ]);

  function author(id: string): AuthorRecord {
    return (
      authors.get(id) ?? {
        id,
        firstName: id,
        lastName: null,
        image: null,
        email: `${id}@example.test`,
        displayName: null,
        headline: null,
        imageAssetOrgId: null,
        imageAssetId: null,
      }
    );
  }

  function withContext(comment: Comment): CommentWithContext {
    return {
      comment,
      courseId: (comment.activityId && activityCourse.get(comment.activityId)) || '',
      activityTitle: (comment.activityId && activityTitle.get(comment.activityId)) || '',
    };
  }

  const repo: DiscussionRepository = {
    async insertComment(_orgId, comment) {
      comments.push({ ...comment });
      return comment;
    },
    async findComment(orgId, id) {
      return comments.find((c) => c.orgId === orgId && c.id === id) ?? null;
    },
    async commenterIds(orgId, target) {
      return [
        ...new Set(
          comments
            .filter(
              (c) =>
                c.orgId === orgId &&
                c.status === 'published' &&
                ('postId' in target
                  ? c.postId === target.postId
                  : c.activityId === target.activityId),
            )
            .map((c) => c.orgUserId),
        ),
      ].sort();
    },
    async updateComment(orgId, id, patch) {
      const c = comments.find((x) => x.orgId === orgId && x.id === id);
      if (!c) {
        return null;
      }
      Object.assign(c, patch);
      return { ...c };
    },
    async listByActivity(orgId, activityId) {
      return comments
        .filter((c) => c.orgId === orgId && c.activityId === activityId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((c) => ({ ...c }));
    },
    async listThreadsByPost(orgId, postId, query) {
      const onPost = comments
        .filter((c) => c.orgId === orgId && c.postId === postId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const replyReadable = (c: Comment) =>
        c.status === 'published' ||
        (c.status === 'pending' && (query.seesHeld || c.orgUserId === query.viewerId));
      const roots = onPost.filter(
        (c) =>
          c.parentId === null &&
          (query.seesHeld || c.status !== 'pending' || c.orgUserId === query.viewerId) &&
          (c.status !== 'removed' ||
            onPost.some((reply) => reply.parentId === c.id && replyReadable(reply))),
      );
      const from = (query.page - 1) * query.pageSize;
      const pageRoots = roots.slice(from, from + query.pageSize);
      const ids = new Set(pageRoots.map((c) => c.id));
      return {
        rows: [
          ...pageRoots,
          ...onPost.filter((c) => c.parentId !== null && ids.has(c.parentId)),
        ].map((c) => ({ ...c })),
        total: roots.length,
        page: query.page,
        pageSize: query.pageSize,
      };
    },
    async reactionsOf(_orgId, commentIds, viewerId) {
      const out: Record<string, CommentReactions> = {};
      for (const r of reactions) {
        if (!commentIds.includes(r.commentId)) {
          continue;
        }
        const entry = (out[r.commentId] ??= { reactions: {} });
        entry.reactions[r.type] = (entry.reactions[r.type] ?? 0) + 1;
        if (r.orgUserId === viewerId) {
          entry.viewerReaction = r.type;
        }
      }
      return out;
    },
    async setReaction(_orgId, commentId, orgUserId, type) {
      const i = reactions.findIndex((r) => r.commentId === commentId && r.orgUserId === orgUserId);
      if (i >= 0) {
        reactions.splice(i, 1);
      }
      if (type !== null) {
        reactions.push({ commentId, orgUserId, type });
      }
      return i < 0 && type !== null;
    },
    async insertReport(_orgId, report) {
      const dup = reports.some(
        (r) => r.commentId === report.commentId && r.orgUserId === report.orgUserId,
      );
      if (dup) {
        return null;
      }
      reports.push({ ...report });
      return report;
    },
    async listOpenReports(orgId, commentIds) {
      return reports
        .filter((r) => r.orgId === orgId && !r.resolvedAt && commentIds.includes(r.commentId))
        .map((r) => ({ ...r }));
    },
    async listOpenFlagsForSpace() {
      return [];
    },
    async publishedCommentCounts() {
      return {};
    },
    async resolveReportsFor(orgId, commentId, resolved) {
      for (const r of reports) {
        if (r.orgId === orgId && r.commentId === commentId && !r.resolvedAt) {
          r.resolvedAt = resolved.resolvedAt;
          r.resolvedBy = resolved.resolvedBy;
          r.resolution = resolved.resolution;
        }
      }
    },
    async authorsOf(_orgId, orgUserIds) {
      const out: Record<string, AuthorRecord> = {};
      for (const id of orgUserIds) {
        out[id] = author(id);
      }
      return out;
    },
    async listComments(orgId, query, courseIds) {
      const open = new Set(reports.filter((r) => !r.resolvedAt).map((r) => r.commentId));
      const matched = comments
        .filter((c) => c.orgId === orgId)
        .map(withContext)
        .filter((e) => {
          const c = e.comment;
          if (courseIds && !courseIds.includes(e.courseId)) {
            return false;
          }
          if (query.status && c.status !== query.status) {
            return false;
          }
          if (query.courseId && e.courseId !== query.courseId) {
            return false;
          }
          if (query.activityId && c.activityId !== query.activityId) {
            return false;
          }
          if (query.orgUserId && c.orgUserId !== query.orgUserId) {
            return false;
          }
          if (query.reported !== undefined && open.has(c.id) !== query.reported) {
            return false;
          }
          if (query.search && !c.body.toLowerCase().includes(query.search.toLowerCase())) {
            return false;
          }
          return true;
        })
        .sort((a, b) => b.comment.createdAt.getTime() - a.comment.createdAt.getTime());
      const from = (query.page - 1) * query.pageSize;
      return {
        rows: matched.slice(from, from + query.pageSize),
        total: matched.length,
        page: query.page,
        pageSize: query.pageSize,
      };
    },
  };
  return { repo, comments, reactions, reports, authors, activityCourse };
}

export function fakeSettings() {
  const rows = new Map<string, Record<string, unknown>>();
  const repo: SettingsRepository = {
    async find(orgId, scopeId, namespace) {
      const out: SettingsRecord[] = [];
      for (const [key, value] of rows) {
        const [rowOrg, rowNs, rowScope] = key.split(':');
        if (rowOrg === orgId && rowScope === scopeId && (!namespace || rowNs === namespace)) {
          out.push({ namespace: rowNs!, scopeId: rowScope!, value });
        }
      }
      return out;
    },
    async patch(orgId, namespace, scopeId, value) {
      const key = `${orgId}:${namespace}:${scopeId}`;
      const merged = { ...(rows.get(key) ?? {}), ...(value as Record<string, unknown>) };
      rows.set(key, merged);
      return { namespace, scopeId, value: merged };
    },
  };
  return { settings: new SettingsService(repo), rows };
}

export function fakeUow(repo: DiscussionRepository, mentions = mentionStore().repo) {
  const appended: NewDiscussionEvent[] = [];
  const uow: DiscussionUnitOfWork = {
    run: (fn) =>
      fn({
        discussion: repo,
        mentions,
        outbox: {
          append: async (events) => {
            appended.push(...(events as unknown as NewDiscussionEvent[]));
          },
        },
      }),
  };
  return { uow, appended };
}

export function fakeAccess() {
  const barred = new Set<string>();
  const access: ContentAccessReader & { canOpenSpace: () => Promise<boolean> } = {
    async hasAccess(_orgId, orgUserId, courseId) {
      return !barred.has(`${orgUserId}:${courseId}`);
    },
    async canOpenSpace() {
      return false;
    },
  };
  return {
    access,
    bar: (orgUserId: string, courseId: string) => barred.add(`${orgUserId}:${courseId}`),
  };
}

function fakeContent(
  activityCourse: Map<string, string>,
  activitySettings: Map<string, unknown>,
): ActivityGetter {
  return {
    async getActivity(activityId) {
      const courseId = activityCourse.get(activityId);
      return courseId
        ? ({ id: activityId, courseId, settings: activitySettings.get(activityId) ?? {} } as never)
        : null;
    },
  };
}

export function makeService(fake = fakeRepo(), gate = fakeAccess()) {
  const mentions = mentionStore();
  const { uow: inner, appended } = fakeUow(fake.repo, mentions.repo);
  const tx = { open: false };
  const escapes: string[] = [];
  const uow: DiscussionUnitOfWork = {
    run: async (fn) => {
      tx.open = true;
      try {
        return await inner.run(fn);
      } finally {
        tx.open = false;
      }
    },
  };
  const outsideTx = <T extends object>(name: string, port: T): T =>
    new Proxy(port, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver) as unknown;
        if (typeof value !== 'function') {
          return value;
        }
        return (...args: unknown[]) => {
          if (tx.open) {
            escapes.push(`${name}.${String(key)}`);
          }
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
  const { settings, rows } = fakeSettings();
  const activitySettings = new Map<string, unknown>();
  const service = new DiscussionServiceImpl({
    repo: fake.repo,
    access: outsideTx('access', gate.access),
    content: outsideTx('content', fakeContent(fake.activityCourse, activitySettings)),
    posts: outsideTx('posts', {
      visible: async () => {
        throw new Error('no post');
      },
      find: async () => null,
    }),
    spaces: outsideTx('spaces', { spaceOpenersAmong: async () => [] }),
    authors: outsideTx('authors', fakeAuthors()),
    mentions: mentions.repo,
    uow,
    settings,
    fileUrls,
  });
  return {
    service,
    escapes,
    appended,
    mentions,
    settings,
    settingsRows: rows,
    activitySettings,
    bar: gate.bar,
    ...fake,
  };
}

/** Write a course's comment settings the way the content surface would: as one
 *  key inside the course's `content` settings row. */
async function setSettings(
  settings: SettingsService,
  courseId: string,
  patch: Partial<CommentSettings>,
): Promise<void> {
  const current =
    (await settings.get<{ comments?: Partial<CommentSettings> }>(
      'o1',
      SettingsNamespace.content,
      courseId,
    )) ?? {};
  await settings.patch('o1', SettingsNamespace.content, courseId, {
    comments: { ...DEFAULT_SETTINGS, ...current.comments, ...patch },
  });
}

function setActivityComments(
  activitySettings: Map<string, unknown>,
  activityId: string,
  comments: ActivityCommentsRule,
): void {
  activitySettings.set(activityId, { comments });
}

/** A course with discussion switched on, ready to post into. */
async function openCourse() {
  const s = makeService();
  await setSettings(s.settings, 'c1', { enabled: true });
  return s;
}

async function configOf(service: DiscussionServiceImpl, activityId: string) {
  return (await service.activityComments(activityId, learner)).config;
}

describe('settings', () => {
  it('is off for a course that has never been configured', async () => {
    const { service } = makeService();
    const config = await configOf(service, 'a1');
    expect(config.enabled).toBe(false);
  });

  it('reads comment settings from under the course settings `comments` key', async () => {
    const { service, settings } = makeService();
    await setSettings(settings, 'c1', { enabled: true, requireReview: true });
    const config = await configOf(service, 'a1');
    expect(config.enabled).toBe(true);
    expect(config.requireReview).toBe(true);
  });

  it('ignores sibling course settings that are not about comments', async () => {
    const { service, settings } = makeService();
    await settings.patch('o1', SettingsNamespace.content, 'c1', {
      transcriptDownloads: true,
      comments: { ...DEFAULT_SETTINGS, enabled: true },
    });
    const config = await configOf(service, 'a1');
    expect(config.enabled).toBe(true);
  });

  it('applies an activity override on top of the course settings', async () => {
    const { service, activitySettings } = await openCourse();
    setActivityComments(activitySettings, 'a1', 'never');
    expect((await configOf(service, 'a1')).enabled).toBe(false);
    expect((await configOf(service, 'a2')).enabled).toBe(true);
  });

  it('cannot be turned back on for an activity once the course switches it off', async () => {
    const { service, settings, activitySettings } = makeService();
    await setSettings(settings, 'c1', { enabled: false });
    setActivityComments(activitySettings, 'a1', 'always');
    expect((await configOf(service, 'a1')).enabled).toBe(false);
  });
});

describe('post', () => {
  it('publishes a learner comment when review is not required', async () => {
    const { service } = await openCourse();
    const view = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'hello' },
      learner,
    );
    expect(view.status).toBe('published');
    expect(view.author.id).toBe(learner.id);
    expect(view.activityId).toBe('a1');
    expect(view.reactions).toEqual({});
    expect(view.viewerReaction).toBeUndefined();
  });

  it('holds a learner comment pending when the course requires review', async () => {
    const { service, settings } = await openCourse();
    await setSettings(settings, 'c1', { requireReview: true });
    const view = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'hello' },
      learner,
    );
    expect(view.status).toBe('pending');
  });

  it('publishes a course moderator’s comment even when review is required', async () => {
    const { service, settings } = await openCourse();
    await setSettings(settings, 'c1', { requireReview: true });
    const view = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'hello' },
      staff,
    );
    expect(view.status).toBe('published');
  });

  it('emits comment.created in the same transaction as the row', async () => {
    const { service, appended } = await openCourse();
    await service.postComment({ activityId: 'a1', parentId: null, body: 'hello' }, learner);
    expect(appended.map((e) => e.type)).toEqual(['discussion.comment.created']);
  });

  it('refuses to post when the activity has comments switched off', async () => {
    const { service, activitySettings } = await openCourse();
    setActivityComments(activitySettings, 'a1', 'never');
    await expect(
      service.postComment({ activityId: 'a1', parentId: null, body: 'x' }, learner),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses to post for a learner without access to the course', async () => {
    const s = await openCourse();
    s.bar(learner.id, 'c1');
    await expect(
      s.service.postComment({ activityId: 'a1', parentId: null, body: 'x' }, learner),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lets a course moderator post without a grant', async () => {
    const s = await openCourse();
    s.bar(staff.id, 'c1');
    const view = await s.service.postComment(
      { activityId: 'a1', parentId: null, body: 'x' },
      staff,
    );
    expect(view.body).toBe('x');
  });

  it('refuses a reply when the course is not threaded', async () => {
    const { service, settings } = await openCourse();
    const root = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'root' },
      learner,
    );
    await setSettings(settings, 'c1', { threaded: false });
    await expect(
      service.postComment({ activityId: 'a1', parentId: root.id, body: 'reply' }, learner),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses to nest a reply below a reply', async () => {
    const { service } = await openCourse();
    const root = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'root' },
      learner,
    );
    const reply = await service.postComment(
      { activityId: 'a1', parentId: root.id, body: 'reply' },
      learner,
    );
    await expect(
      service.postComment({ activityId: 'a1', parentId: reply.id, body: 'deeper' }, learner),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses a reply to a comment on another activity', async () => {
    const { service } = await openCourse();
    const root = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'root' },
      learner,
    );
    await expect(
      service.postComment({ activityId: 'a2', parentId: root.id, body: 'reply' }, learner),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses a reply to a comment that is not published', async () => {
    const { service, settings } = await openCourse();
    await setSettings(settings, 'c1', { requireReview: true });
    const pending = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'root' },
      learner,
    );
    await expect(
      service.postComment({ activityId: 'a1', parentId: pending.id, body: 'reply' }, other),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('activityComments', () => {
  it('serves nothing at all when the activity has comments switched off', async () => {
    const { service, activitySettings } = await openCourse();
    setActivityComments(activitySettings, 'a1', 'never');
    const { config, comments } = await service.activityComments('a1', learner);
    expect(config.enabled).toBe(false);
    expect(comments).toEqual([]);
  });

  it('badges the author by the role they hold on the course', async () => {
    const { service } = await openCourse();
    await service.postComment({ activityId: 'a1', parentId: null, body: 'hello' }, staff);
    const { comments } = await service.activityComments('a1', learner);
    expect(comments[0]?.author.id).toBe(staff.id);
    expect(comments[0]?.author).toMatchObject({ team: true, roleName: 'Instructor' });
  });

  it('names the author by their profile and serves the photo only when it is in this org', async () => {
    const { service, authors } = await openCourse();
    authors.set(learner.id, {
      id: learner.id,
      firstName: 'Sarah',
      lastName: 'Lee',
      image: 'https://avatar',
      email: 'sarah@example.test',
      displayName: 'Sarah from Acme',
      headline: 'Founder',
      imageAssetOrgId: 'o1',
      imageAssetId: 'ast_photo',
    });
    authors.set(other.id, {
      id: other.id,
      firstName: 'James',
      lastName: 'Hunt',
      image: 'https://avatar-2',
      email: 'james@example.test',
      displayName: null,
      headline: null,
      imageAssetOrgId: 'o2',
      imageAssetId: 'ast_elsewhere',
    });
    await service.postComment({ activityId: 'a1', parentId: null, body: 'a' }, learner);
    await service.postComment({ activityId: 'a1', parentId: null, body: 'b' }, other);
    const { comments } = await service.activityComments('a1', staff);
    expect(comments[0]?.author).toEqual({
      id: learner.id,
      firstName: 'Sarah',
      lastName: 'Lee',
      displayName: 'Sarah from Acme',
      headline: 'Founder',
      image: 'https://avatar',
      imageAssetId: 'ast_photo',
      imageUrl: fileUrls.personImage(learner.id),
      team: false,
      roleName: null,
    });
    expect(comments[1]?.author).toMatchObject({
      displayName: 'James Hunt',
      image: 'https://avatar-2',
      imageAssetId: null,
      imageUrl: null,
    });
  });

  it('never serves an author email', async () => {
    const { service } = await openCourse();
    await service.postComment({ activityId: 'a1', parentId: null, body: 'hello' }, learner);
    const { comments } = await service.activityComments('a1', learner);
    expect(comments[0]).not.toHaveProperty('authorEmail');
    expect(JSON.stringify(comments[0]?.author)).not.toContain('@');
  });

  it('shows a pending comment to its author and to the course’s moderators, nobody else', async () => {
    const { service, settings } = await openCourse();
    await setSettings(settings, 'c1', { requireReview: true });
    await service.postComment({ activityId: 'a1', parentId: null, body: 'held' }, learner);
    expect((await service.activityComments('a1', learner)).comments).toHaveLength(1);
    expect((await service.activityComments('a1', staff)).comments).toHaveLength(1);
    expect((await service.activityComments('a1', other)).comments).toHaveLength(0);
  });

  it('nulls a removed comment body but still names who removed it', async () => {
    const { service } = await openCourse();
    const root = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'root' },
      learner,
    );
    await service.postComment({ activityId: 'a1', parentId: root.id, body: 'reply' }, other);
    await service.remove(root.id, 'any', staff);

    const { comments } = await service.activityComments('a1', learner);
    const placeholder = comments.find((c) => c.id === root.id);
    expect(placeholder?.body).toBeNull();
    expect(placeholder?.removedBy?.id).toBe(staff.id);
  });

  it('signs the author and remover photos on every comment view', async () => {
    const { service, authors } = await openCourse();
    authors.set(learner.id, photo(learner.id, 'ast_learner'));
    authors.set(staff.id, photo(staff.id, 'ast_staff'));
    const root = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'root' },
      learner,
    );
    expect(root.author.imageUrl).toBe(fileUrls.personImage(learner.id));
    const edited = await service.edit(root.id, 'root, edited', learner);
    expect(edited.author.imageUrl).toBe(fileUrls.personImage(learner.id));
    await service.postComment({ activityId: 'a1', parentId: root.id, body: 'reply' }, other);
    await service.remove(root.id, 'any', staff);
    const { comments } = await service.activityComments('a1', learner);
    const placeholder = comments.find((c) => c.id === root.id);
    expect(placeholder?.author).toMatchObject({
      imageAssetId: 'ast_learner',
      imageUrl: fileUrls.personImage(learner.id),
    });
    expect(placeholder?.removedBy).toMatchObject({
      id: staff.id,
      imageAssetId: 'ast_staff',
      imageUrl: fileUrls.personImage(staff.id),
    });
    expect(comments.find((c) => c.id !== root.id)?.author.imageUrl).toBeNull();
  });

  it('drops a removed root once no visible reply holds it open', async () => {
    const { service } = await openCourse();
    const root = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'root' },
      learner,
    );
    await service.remove(root.id, 'any', learner);
    expect((await service.activityComments('a1', learner)).comments).toHaveLength(0);
  });

  it('never serves a removed reply', async () => {
    const { service } = await openCourse();
    const root = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'root' },
      learner,
    );
    const reply = await service.postComment(
      { activityId: 'a1', parentId: root.id, body: 'reply' },
      other,
    );
    await service.remove(reply.id, 'any', other);
    const { comments } = await service.activityComments('a1', learner);
    expect(comments.map((c) => c.id)).toEqual([root.id]);
  });

  it('judges a removed root against replies THIS reader can see', async () => {
    const { service, settings } = await openCourse();
    await setSettings(settings, 'c1', { requireReview: true });
    const root = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'root' },
      staff,
    );
    await service.postComment(
      { activityId: 'a1', parentId: root.id, body: 'pending reply' },
      learner,
    );
    await service.remove(root.id, 'any', staff);

    expect((await service.activityComments('a1', learner)).comments).toHaveLength(2);
    expect((await service.activityComments('a1', other)).comments).toHaveLength(0);
  });

  it('serves reaction counts with the reader own kind marked', async () => {
    const { service } = await openCourse();
    const c = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'hello' },
      learner,
    );
    await service.setReaction(c.id, 'like', learner);
    await service.setReaction(c.id, 'like', other);
    await service.setReaction(c.id, 'curious', staff);

    const mine = (await service.activityComments('a1', learner)).comments[0];
    expect(mine?.reactions).toEqual({ like: 2, curious: 1 });
    expect(mine?.viewerReaction).toBe('like');

    const theirs = (await service.activityComments('a1', staff)).comments[0];
    expect(theirs?.reactions).toEqual({ like: 2, curious: 1 });
    expect(theirs?.viewerReaction).toBe('curious');
  });

  it('leaves viewerReaction absent for a reader who has not reacted', async () => {
    const { service } = await openCourse();
    const c = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'hello' },
      learner,
    );
    await service.setReaction(c.id, 'like', other);
    const view = (await service.activityComments('a1', learner)).comments[0];
    expect(view?.viewerReaction).toBeUndefined();
  });

  it('serves no reaction counts at all when the course disables reactions', async () => {
    const { service, settings } = await openCourse();
    const c = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'hello' },
      learner,
    );
    await service.setReaction(c.id, 'like', learner);
    await setSettings(settings, 'c1', { reactions: false });
    const view = (await service.activityComments('a1', learner)).comments[0];
    expect(view?.reactions).toEqual({});
    expect(view?.viewerReaction).toBeUndefined();
  });

  it('throws rather than serving a comment whose author has vanished', async () => {
    const fake = fakeRepo();
    const s = makeService(fake);
    await setSettings(s.settings, 'c1', { enabled: true });
    await s.service.postComment({ activityId: 'a1', parentId: null, body: 'hello' }, learner);
    fake.repo.authorsOf = async () => ({});
    await expect(s.service.activityComments('a1', learner)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('edit, remove, restore, approve', () => {
  it('lets the author revise their own comment', async () => {
    const { service } = await openCourse();
    const c = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'first' },
      learner,
    );
    const edited = await service.edit(c.id, 'second', learner);
    expect(edited.body).toBe('second');
  });

  it('refuses an edit by anyone else, moderators included', async () => {
    const { service } = await openCourse();
    const c = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'first' },
      learner,
    );
    await expect(service.edit(c.id, 'x', staff)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses to edit a removed comment', async () => {
    const { service } = await openCourse();
    const c = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'first' },
      learner,
    );
    await service.remove(c.id, 'any', learner);
    await expect(service.edit(c.id, 'x', learner)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lets the author or a moderator remove, but not a bystander', async () => {
    const { service } = await openCourse();
    const mine = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'a' },
      learner,
    );
    const theirs = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'b' },
      other,
    );
    expect((await service.remove(mine.id, 'any', learner)).status).toBe('removed');
    expect((await service.remove(theirs.id, 'any', staff)).status).toBe('removed');
    expect(await service.remove(theirs.id, 'any', staff)).toMatchObject({
      body: null,
      removedBy: { id: staff.id },
    });

    const third = await service.postComment({ activityId: 'a1', parentId: null, body: 'c' }, other);
    await expect(service.remove(third.id, 'any', learner)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('emits comment.removed once, and is idempotent on a second removal', async () => {
    const { service, appended } = await openCourse();
    const c = await service.postComment({ activityId: 'a1', parentId: null, body: 'a' }, learner);
    await service.remove(c.id, 'any', learner);
    await service.remove(c.id, 'any', learner);
    expect(appended.filter((e) => e.type === 'discussion.comment.removed')).toHaveLength(1);
  });

  it('reads who can open the lesson before the transaction when a comment with mentions is approved', async () => {
    const { service, settings, escapes, appended } = await openCourse();
    await setSettings(settings, 'c1', { requireReview: true });
    const c = await service.postComment(
      { activityId: 'a1', parentId: null, body: `Thanks <@${staff.id}>` },
      learner,
    );
    await service.approve(c.id, staff);
    expect(appended.filter((e) => e.type === 'discussion.comment.published')).toHaveLength(1);
    expect(escapes).toEqual([]);
  });

  it('lets only a moderator restore or approve', async () => {
    const { service, settings } = await openCourse();
    await setSettings(settings, 'c1', { requireReview: true });
    const c = await service.postComment({ activityId: 'a1', parentId: null, body: 'a' }, learner);
    await expect(service.approve(c.id, learner)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await service.approve(c.id, staff)).status).toBe('published');

    await service.remove(c.id, 'any', staff);
    await expect(service.restore(c.id, 'any', learner)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await service.restore(c.id, 'any', staff)).status).toBe('published');
  });

  it('refuses to approve a comment that is not pending', async () => {
    const { service } = await openCourse();
    const c = await service.postComment({ activityId: 'a1', parentId: null, body: 'a' }, learner);
    await expect(service.approve(c.id, staff)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('clears removedBy when a comment is restored', async () => {
    const { service } = await openCourse();
    const c = await service.postComment({ activityId: 'a1', parentId: null, body: 'a' }, learner);
    await service.remove(c.id, 'any', staff);
    expect((await service.restore(c.id, 'any', staff)).removedBy).toBeNull();
  });

  it('throws for a comment that does not exist', async () => {
    const { service } = await openCourse();
    await expect(service.remove('nope', 'any', staff)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.edit('nope', 'x', learner)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('reactions', () => {
  async function seeded() {
    const s = await openCourse();
    const c = await s.service.postComment(
      { activityId: 'a1', parentId: null, body: 'hello' },
      learner,
    );
    return { ...s, commentId: c.id };
  }

  it('returns the whole state so the caller never recomputes a count', async () => {
    const { service, commentId } = await seeded();
    const state = await service.setReaction(commentId, 'like', learner);
    expect(state).toEqual({ reactions: { like: 1 }, viewerReaction: 'like' });
  });

  it('replaces rather than accumulates when a reader reacts again', async () => {
    const { service, commentId } = await seeded();
    await service.setReaction(commentId, 'like', learner);
    const state = await service.setReaction(commentId, 'curious', learner);
    expect(state).toEqual({ reactions: { curious: 1 }, viewerReaction: 'curious' });
  });

  it('is a no-op rather than a toggle when the same kind arrives twice', async () => {
    const { service, commentId } = await seeded();
    await service.setReaction(commentId, 'like', learner);
    const state = await service.setReaction(commentId, 'like', learner);
    expect(state).toEqual({ reactions: { like: 1 }, viewerReaction: 'like' });
  });

  it('clears, leaving everyone else counted', async () => {
    const { service, commentId } = await seeded();
    await service.setReaction(commentId, 'like', learner);
    await service.setReaction(commentId, 'like', other);
    const state = await service.setReaction(commentId, null, learner);
    expect(state).toEqual({ reactions: { like: 1 } });
    expect(state.viewerReaction).toBeUndefined();
  });

  it('refuses a new reaction when the course disables reactions', async () => {
    const { service, settings, commentId } = await seeded();
    await setSettings(settings, 'c1', { reactions: false });
    await expect(service.setReaction(commentId, 'like', learner)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('still lets a reader withdraw one after reactions are switched off', async () => {
    const { service, settings, commentId } = await seeded();
    await service.setReaction(commentId, 'like', learner);
    await setSettings(settings, 'c1', { reactions: false });
    await expect(service.setReaction(commentId, null, learner)).resolves.toEqual({
      reactions: {},
    });
  });

  it('refuses when the activity has comments switched off', async () => {
    const { service, activitySettings, commentId } = await seeded();
    setActivityComments(activitySettings, 'a1', 'never');
    await expect(service.setReaction(commentId, 'like', learner)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('refuses on a removed comment', async () => {
    const { service, commentId } = await seeded();
    await service.remove(commentId, 'any', staff);
    await expect(service.setReaction(commentId, 'like', learner)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe('reports', () => {
  async function seeded() {
    const s = await openCourse();
    const c = await s.service.postComment(
      { activityId: 'a1', parentId: null, body: 'hello' },
      learner,
    );
    return { ...s, commentId: c.id };
  }

  it('records a report and emits comment.reported', async () => {
    const { service, appended, commentId } = await seeded();
    const report = await service.reportComment(commentId, 'spam', other);
    expect(report.reason).toBe('spam');
    expect(appended.filter((e) => e.type === 'discussion.comment.reported')).toHaveLength(1);
  });

  it('returns the existing report and emits nothing on a duplicate', async () => {
    const { service, appended, commentId } = await seeded();
    const first = await service.reportComment(commentId, 'spam', other);
    const second = await service.reportComment(commentId, 'again', other);
    expect(second.id).toBe(first.id);
    expect(appended.filter((e) => e.type === 'discussion.comment.reported')).toHaveLength(1);
  });

  it('refuses a report on an activity with comments switched off', async () => {
    const { service, activitySettings, commentId } = await seeded();
    setActivityComments(activitySettings, 'a1', 'never');
    await expect(service.reportComment(commentId, 'spam', other)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('closes every open report on a comment', async () => {
    const { service, reports, commentId } = await seeded();
    await service.reportComment(commentId, 'spam', other);
    await service.resolveReports(commentId, 'any', staff);
    expect(reports.every((r) => r.resolvedAt !== null)).toBe(true);
    expect(reports[0]?.resolution).toBe('dismissed');
  });

  it('resolves open reports as removed when the comment is removed', async () => {
    const { service, reports, commentId } = await seeded();
    await service.reportComment(commentId, 'spam', other);
    await service.remove(commentId, 'any', staff);
    expect(reports[0]).toMatchObject({ resolution: 'removed', resolvedBy: staff.id });
  });

  it('leaves open reports open when the author removes their own comment', async () => {
    const { service, reports, commentId } = await seeded();
    await service.reportComment(commentId, 'spam', other);
    await service.remove(commentId, 'any', learner);
    expect(reports[0]).toMatchObject({ resolvedAt: null, resolution: null, resolvedBy: null });
  });

  it('refuses to close reports for a learner', async () => {
    const { service, commentId } = await seeded();
    await service.reportComment(commentId, 'spam', other);
    await expect(service.resolveReports(commentId, 'any', learner)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe('listComments', () => {
  async function seeded() {
    const s = await openCourse();
    const a = await s.service.postComment(
      { activityId: 'a1', parentId: null, body: 'first post' },
      learner,
    );
    const b = await s.service.postComment(
      { activityId: 'a2', parentId: null, body: 'second post' },
      other,
    );
    return { ...s, a, b };
  }

  it('carries the course and activity title a moderation card needs', async () => {
    const { service } = await seeded();
    const page = await service.listComments(q({ activityId: 'a1' }), moderator);
    expect(page.rows[0]?.courseId).toBe('c1');
    expect(page.rows[0]?.activityTitle).toBe('Lesson one');
  });

  it('carries the author email, which a reader is never given', async () => {
    const { service } = await seeded();
    const page = await service.listComments(q({ activityId: 'a1' }), moderator);
    expect(page.rows[0]?.authorEmail).toBe(`${learner.id}@example.test`);
    expect(page.rows[0]?.author.id).toBe(learner.id);
  });

  it('serves a removed comment with its body, which a reader is never given', async () => {
    const { service, a } = await seeded();
    await service.remove(a.id, 'any', staff);
    const page = await service.listComments(q({ activityId: 'a1' }), moderator);
    expect(page.rows[0]?.body).toBe('first post');
    expect(page.rows[0]?.status).toBe('removed');
    expect(page.rows[0]?.removedBy).toBe(staff.id);
  });

  it('attaches open reports with the reporter named', async () => {
    const { service, a } = await seeded();
    await service.reportComment(a.id, 'spam', other);
    const page = await service.listComments(q({ activityId: 'a1' }), moderator);
    expect(page.rows[0]?.reports).toHaveLength(1);
    expect(page.rows[0]?.reports[0]?.reporter.id).toBe(other.id);
    expect(page.rows[0]?.reports[0]?.reason).toBe('spam');
  });

  it('signs the author and reporter photos', async () => {
    const { service, a, authors } = await seeded();
    authors.set(learner.id, photo(learner.id, 'ast_learner'));
    authors.set(other.id, photo(other.id, 'ast_other'));
    await service.reportComment(a.id, 'spam', other);
    const page = await service.listComments(q({ activityId: 'a1' }), moderator);
    expect(page.rows[0]?.author).toMatchObject({
      imageAssetId: 'ast_learner',
      imageUrl: fileUrls.personImage(learner.id),
    });
    expect(page.rows[0]?.reports[0]?.reporter).toMatchObject({
      imageAssetId: 'ast_other',
      imageUrl: fileUrls.personImage(other.id),
    });
  });

  it('leaves reports empty on a comment nobody has flagged', async () => {
    const { service } = await seeded();
    const page = await service.listComments(q({ activityId: 'a2' }), moderator);
    expect(page.rows[0]?.reports).toEqual([]);
  });

  it('narrows by author, activity and body search', async () => {
    const { service } = await seeded();
    expect((await service.listComments(q({ orgUserId: other.id }), moderator)).rows).toHaveLength(
      1,
    );
    expect((await service.listComments(q({ activityId: 'a2' }), moderator)).rows).toHaveLength(1);
    expect((await service.listComments(q({ search: 'second' }), moderator)).rows).toHaveLength(1);
  });

  it('narrows to comments carrying an open report, or to those carrying none', async () => {
    const { service, a } = await seeded();
    await service.reportComment(a.id, 'spam', other);
    expect(
      (await service.listComments(q({ reported: true }), moderator)).rows.map((r) => r.id),
    ).toEqual([a.id]);
    expect((await service.listComments(q({ reported: false }), moderator)).rows).toHaveLength(1);
  });

  it('returns an empty page without looking anyone up', async () => {
    const { service } = await openCourse();
    const page = await service.listComments(q(), moderator);
    expect(page.rows).toEqual([]);
    expect(page.total).toBe(0);
  });

  it('throws rather than serving a blank author placeholder', async () => {
    const fake = fakeRepo();
    const s = makeService(fake);
    await setSettings(s.settings, 'c1', { enabled: true });
    await s.service.postComment({ activityId: 'a1', parentId: null, body: 'hello' }, learner);
    fake.repo.authorsOf = async () => ({});
    await expect(s.service.listComments(q(), moderator)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('comments on a post', () => {
  const post = {
    orgId: 'o1',
    id: 'pst_1',
    communityId: 'cmy_1',
    spaceId: 'spc_1',
    orgUserId: learner.id,
    topicId: null,
    title: 'Hello',
    body: 'Body',
    extra: {},
    coverAssetId: null,
    status: 'published' as const,
    scheduledAt: null,
    publishedAt: new Date('2026-10-21T12:00:00.000Z'),
    removedBy: null,
    pinned: false,
    commentsClosed: null as boolean | null,
    reactionsEnabled: null,
    createdAt: new Date('2026-10-21T12:00:00.000Z'),
    updatedAt: new Date('2026-10-21T12:00:00.000Z'),
  };
  const space = {
    orgId: 'o1',
    id: 'spc_1',
    communityId: 'cmy_1',
    name: 'Announcements',
    description: '',
    seq: 0,
    accessRule: 'all_members' as const,
    capacity: null,
    settings: { comments: true, reactions: true, requireReview: false },
    topics: [],
    links: [],
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };

  function postService(
    commentsClosed: boolean | null = null,
    status: PostStatus = 'published',
    hiddenFrom?: string,
  ) {
    const fake = fakeRepo();
    const mentions = mentionStore();
    const { uow, appended } = fakeUow(fake.repo, mentions.repo);
    const { settings } = fakeSettings();
    const gate = fakeAccess();
    const service = new DiscussionServiceImpl({
      repo: fake.repo,
      access: gate.access,
      content: fakeContent(fake.activityCourse, new Map()),
      posts: {
        visible: async (postId, actor) => {
          if (actor.id === hiddenFrom) {
            throw new NotFoundError('Post', postId);
          }
          return { post: { ...post, commentsClosed, status }, space };
        },
        find: async () => ({ ...post, commentsClosed, status }),
      },
      spaces: {
        spaceOpenersAmong: async (_orgId, _spaceId, orgUserIds) =>
          orgUserIds.filter((id) => id !== hiddenFrom && id !== 'ou_outside'),
      },
      authors: fakeAuthors(),
      mentions: mentions.repo,
      uow,
      settings,
      fileUrls,
    });
    return { service, appended, mentions, ...fake };
  }

  it('announces a first reaction to a comment on a post with the post’s space', async () => {
    const { service, appended } = postService();
    const view = await service.postComment(
      { postId: 'pst_1', parentId: null, body: 'hi' },
      learner,
    );
    await service.setReaction(view.id, '👍', other);
    expect(appended.at(-1)).toMatchObject({
      type: 'discussion.comment.reaction.added',
      data: {
        commentId: view.id,
        postId: 'pst_1',
        activityId: null,
        spaceId: space.id,
        communityId: 'cmy_1',
        orgUserId: other.id,
        reaction: '👍',
      },
      metadata: { actorId: other.id },
    });
    await service.edit(view.id, 'edited', learner);
    expect(appended.at(-1)).toMatchObject({
      type: 'discussion.comment.updated',
      data: { body: 'edited', mentionedOrgUserIds: [] },
      metadata: { actorId: learner.id },
    });
  });

  it('mentions the people who can open the post’s space and carries them on creation', async () => {
    const { service, appended, mentions } = postService();
    const view = await service.postComment(
      { postId: 'pst_1', parentId: null, body: '<@ou_other> <@ou_outside> <@ou_other>' },
      learner,
    );
    expect(appended.at(-1)?.data).toMatchObject({ mentionedOrgUserIds: [other.id] });
    expect(mentions.rows.map((row) => row.orgUserId)).toEqual([other.id]);
    expect(view.mentions).toEqual([{ orgUserId: other.id, name: other.id }]);
    await service.edit(view.id, 'now <@ou_staff>', learner);
    expect(mentions.rows.map((row) => row.orgUserId)).toEqual([staff.id]);
    const listed = await service.postComments('pst_1', { page: 1, pageSize: 10 }, learner);
    expect(listed.rows[0]?.mentions).toEqual([{ orgUserId: staff.id, name: staff.id }]);
  });

  it('is created published and does not emit comment.published', async () => {
    const { service, appended } = postService();
    const view = await service.postComment(
      { postId: 'pst_1', parentId: null, body: 'hi' },
      learner,
    );
    expect(view.status).toBe('published');
    expect(view.activityId).toBeNull();
    expect(view.postId).toBe('pst_1');
    expect(view.communityId).toBe('cmy_1');
    expect(appended.map((event) => event.type)).toEqual(['discussion.comment.created']);
  });

  it('refuses a comment on a post that is not published', async () => {
    for (const status of ['draft', 'scheduled', 'pending', 'removed'] as const) {
      const { service, appended, comments } = postService(null, status);
      await expect(
        service.postComment({ postId: 'pst_1', parentId: null, body: 'hi' }, learner),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(appended).toHaveLength(0);
      expect(comments).toHaveLength(0);
    }
  });

  it('leaves flags open when the author removes a post comment and resolves them for a moderator', async () => {
    const { service, reports } = postService();
    const mine = await service.postComment(
      { postId: 'pst_1', parentId: null, body: 'mine' },
      learner,
    );
    const theirs = await service.postComment(
      { postId: 'pst_1', parentId: null, body: 'theirs' },
      other,
    );
    await service.reportComment(mine.id, 'spam', other);
    await service.reportComment(theirs.id, 'spam', learner);
    await service.remove(mine.id, 'any', learner);
    await service.remove(theirs.id, 'any', communityMod);
    expect(reports.find((r) => r.commentId === mine.id)?.resolvedAt).toBeNull();
    expect(reports.find((r) => r.commentId === theirs.id)).toMatchObject({
      resolution: 'removed',
      resolvedBy: 'ou_mod',
    });
  });

  it('finds a comment to moderate only in the community it names', async () => {
    const { service } = postService();
    const view = await service.postComment(
      { postId: 'pst_1', parentId: null, body: 'hi' },
      learner,
    );
    await service.reportComment(view.id, 'spam', other);
    await expect(
      service.resolveReports(view.id, { communityId: 'cmy_other' }, admin),
    ).rejects.toBeInstanceOf(NotFoundError);
    await service.resolveReports(view.id, { communityId: 'cmy_1' }, admin);
    await expect(
      service.remove(view.id, { communityId: 'cmy_other' }, admin),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect((await service.remove(view.id, { communityId: 'cmy_1' }, admin)).status).toBe('removed');
    await expect(
      service.restore(view.id, { communityId: 'cmy_other' }, admin),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect((await service.restore(view.id, { communityId: 'cmy_1' }, admin)).status).toBe(
      'published',
    );
  });

  it('keeps course comment moderation off comments on posts', async () => {
    const { service, reports } = postService();
    const view = await service.postComment(
      { postId: 'pst_1', parentId: null, body: 'hi' },
      learner,
    );
    await service.reportComment(view.id, 'spam', other);
    for (const actor of [moderator, staff, admin]) {
      await expect(service.resolveReports(view.id, 'lesson', actor)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      await expect(service.remove(view.id, 'lesson', actor)).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.restore(view.id, 'lesson', actor)).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.publish(view.id, 'lesson', actor)).rejects.toBeInstanceOf(NotFoundError);
    }
    for (const actor of [moderator, staff]) {
      await expect(service.resolveReports(view.id, 'any', actor)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(service.remove(view.id, 'any', actor)).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(reports[0]?.resolvedAt).toBeNull();
  });

  it('lets communities:moderate on the post’s community moderate its comments, and nobody else', async () => {
    const { service, reports } = postService();
    const elsewhereMod = person({ id: 'ou_mod_2', content: { cmy_2: ['communities:moderate'] } });
    const view = await service.postComment(
      { postId: 'pst_1', parentId: null, body: 'hi' },
      learner,
    );
    await service.reportComment(view.id, 'spam', other);
    for (const actor of [other, elsewhereMod]) {
      await expect(service.resolveReports(view.id, 'any', actor)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(service.remove(view.id, 'any', actor)).rejects.toBeInstanceOf(ForbiddenError);
    }
    await service.resolveReports(view.id, 'any', communityMod);
    expect(reports[0]?.resolution).toBe('dismissed');
    expect((await service.remove(view.id, 'any', communityMod)).status).toBe('removed');
    await expect(service.restore(view.id, 'any', other)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await service.restore(view.id, 'any', communityMod)).status).toBe('published');
  });

  it('badges a moderator as team on comments in their community', async () => {
    const { service } = postService();
    await service.postComment({ postId: 'pst_1', parentId: null, body: 'hi' }, communityMod);
    await service.postComment({ postId: 'pst_1', parentId: null, body: 'hey' }, learner);
    const { rows } = await service.postComments('pst_1', { page: 1, pageSize: 10 }, learner);
    expect(rows.map((row) => [row.author.id, row.author.team, row.author.roleName])).toEqual([
      [communityMod.id, true, 'Moderator'],
      [learner.id, false, null],
    ]);
  });

  it('shows held post comments only to a moderator of the community', async () => {
    const { service, comments } = postService();
    const view = await service.postComment({ postId: 'pst_1', parentId: null, body: 'hi' }, other);
    comments[0] = { ...comments[0]!, status: 'pending' };
    const page = { page: 1, pageSize: 10 };
    expect((await service.postComments('pst_1', page, communityMod)).rows).toHaveLength(1);
    expect((await service.postComments('pst_1', page, admin)).rows).toHaveLength(1);
    expect((await service.postComments('pst_1', page, learner)).rows).toHaveLength(0);
    expect((await service.postComments('pst_1', page, staff)).rows).toHaveLength(0);
    expect(view.status).toBe('published');
  });

  it('answers a comment on a post the person cannot open exactly like a missing comment', async () => {
    const { service } = postService(null, 'published', 'ou_out');
    const view = await service.postComment(
      { postId: 'pst_1', parentId: null, body: 'hi' },
      learner,
    );
    const message = async (run: Promise<unknown>) => {
      const error = await run.catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(NotFoundError);
      return (error as Error).message;
    };
    const expected = await message(service.edit('cmt_missing', 'x', learner));
    for (const run of [
      service.edit(view.id, 'x', outsider),
      service.remove(view.id, 'any', outsider),
      service.setReaction(view.id, '👍', outsider),
      service.reportComment(view.id, 'spam', outsider),
      service.resolveReports(view.id, 'any', outsider),
    ]) {
      expect(await message(run)).toBe(expected);
    }
    await expect(
      service.postComments('pst_1', { page: 1, pageSize: 20 }, outsider),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('pages post comments by top-level thread and serves each page with its replies', async () => {
    const { service, comments } = postService();
    const say = async (actor: Actor, body: string, parentId: string | null = null) => {
      const view = await service.postComment({ postId: 'pst_1', parentId, body }, actor);
      const last = comments.length - 1;
      comments[last] = { ...comments[last]!, createdAt: new Date(Date.UTC(2026, 9, 22, 12, last)) };
      return view;
    };
    const first = await say(learner, 'first');
    await say(other, 'reply to first', first.id);
    const dropped = await say(other, 'removed, no replies');
    await service.remove(dropped.id, 'any', other);
    await say(other, 'second');
    const third = await say(learner, 'third');
    await say(learner, 'reply to third', third.id);

    const one = await service.postComments('pst_1', { page: 1, pageSize: 2 }, learner);
    expect(one).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(one.rows.map((c) => c.body)).toEqual(['first', 'reply to first', 'second']);

    const two = await service.postComments('pst_1', { page: 2, pageSize: 2 }, learner);
    expect(two.total).toBe(3);
    expect(two.rows.map((c) => [c.body, c.parentId])).toEqual([
      ['third', null],
      ['reply to third', third.id],
    ]);
  });

  it('refuses a comment when the post has comments closed', async () => {
    const { service } = postService(true);
    await expect(
      service.postComment({ postId: 'pst_1', parentId: null, body: 'hi' }, learner),
    ).rejects.toThrow('Comments are closed on this post');
  });
});

describe('course access', () => {
  it('lets courses:read on the course open an activity without a grant', async () => {
    const { service, bar } = await openCourse();
    const reader = person({ id: 'ou_reader', content: { c1: ['courses:read'] } });
    const readerElsewhere = person({ id: 'ou_reader_2', content: { c2: ['courses:read'] } });
    bar(reader.id, 'c1');
    bar(readerElsewhere.id, 'c1');
    bar(learner.id, 'c1');
    await expect(service.activityComments('a1', reader)).resolves.toBeDefined();
    await expect(
      service.postComment({ activityId: 'a1', parentId: null, body: 'x' }, reader),
    ).resolves.toBeDefined();
    await expect(service.activityComments('a1', readerElsewhere)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(service.activityComments('a1', learner)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('a learner with a grant', () => {
  it('posts a lesson comment, with every content read passing the system actor', async () => {
    const fake = fakeRepo();
    const { uow } = fakeUow(fake.repo);
    const { settings } = fakeSettings();
    await setSettings(settings, 'c1', { enabled: true });
    const readers: Actor[] = [];
    const service = new DiscussionServiceImpl({
      repo: fake.repo,
      access: fakeAccess().access,
      content: {
        async getActivity(activityId, actor) {
          readers.push(actor);
          return { id: activityId, courseId: 'c1', settings: {} } as never;
        },
      },
      posts: { visible: async () => null as never, find: async () => null },
      spaces: { spaceOpenersAmong: async () => [] },
      authors: fakeAuthors(),
      mentions: mentionStore().repo,
      uow,
      settings,
      fileUrls,
    });
    const view = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'Hola' },
      learner,
    );
    expect(view).toMatchObject({ status: 'published', author: { id: learner.id } });
    expect(readers.length).toBeGreaterThan(0);
    expect(readers.every((actor) => actor.id === 'system')).toBe(true);
    expect(readers.every((actor) => actor.permissions.has('courses:write', 'c1'))).toBe(true);
  });
});

describe('lesson comment moderation is courses:moderate on the comment’s course', () => {
  async function seeded() {
    const s = await openCourse();
    await setSettings(s.settings, 'c2', { enabled: true });
    const c1 = await s.service.postComment(
      { activityId: 'a1', parentId: null, body: 'in basics' },
      learner,
    );
    const c2 = await s.service.postComment(
      { activityId: 'b1', parentId: null, body: 'in grammar' },
      learner,
    );
    return { ...s, c1, c2 };
  }

  it('shows held comments to a moderator of the course only', async () => {
    const { service, settings } = await openCourse();
    await setSettings(settings, 'c1', { requireReview: true });
    await service.postComment({ activityId: 'a1', parentId: null, body: 'held' }, learner);
    expect((await service.activityComments('a1', staff)).comments).toHaveLength(1);
    expect((await service.activityComments('a1', moderator)).comments).toHaveLength(1);
    expect((await service.activityComments('a1', elsewhere)).comments).toHaveLength(0);
    expect((await service.activityComments('a1', other)).comments).toHaveLength(0);
  });

  it('approves only for a moderator of the course', async () => {
    const { service, settings } = await openCourse();
    await setSettings(settings, 'c1', { requireReview: true });
    const c = await service.postComment({ activityId: 'a1', parentId: null, body: 'a' }, learner);
    await expect(service.approve(c.id, elsewhere)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.approve(c.id, other)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.publish(c.id, 'any', elsewhere)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await service.approve(c.id, staff)).status).toBe('published');
  });

  it('restores only for a moderator of the course', async () => {
    const { service, c1 } = await seeded();
    await service.remove(c1.id, 'any', learner);
    await expect(service.restore(c1.id, 'any', elsewhere)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.restore(c1.id, 'any', other)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await service.restore(c1.id, 'any', staff)).status).toBe('published');
  });

  it('removes another person’s comment only for a moderator of the course', async () => {
    const { service, c1, c2 } = await seeded();
    await expect(service.remove(c1.id, 'any', elsewhere)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.remove(c1.id, 'any', other)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.remove(c2.id, 'any', staff)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await service.remove(c1.id, 'any', staff)).status).toBe('removed');
    expect((await service.remove(c2.id, 'any', elsewhere)).status).toBe('removed');
  });

  it('replies from the moderation queue only for a moderator of the course, onto the root', async () => {
    const { service, c1 } = await seeded();
    const reply = await service.postComment(
      { activityId: 'a1', parentId: c1.id, body: 'reply' },
      other,
    );
    await expect(service.replyToComment(reply.id, 'x', elsewhere)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(service.replyToComment(reply.id, 'x', learner)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const answer = await service.replyToComment(reply.id, 'Thanks!', staff);
    expect(answer).toMatchObject({ parentId: c1.id, activityId: 'a1', body: 'Thanks!' });
    expect(answer.author).toMatchObject({ id: staff.id, team: true, roleName: 'Instructor' });
    await expect(service.replyToComment('cmt_missing', 'x', staff)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('resolves reports only for a moderator of the course', async () => {
    const { service, reports, c1 } = await seeded();
    await service.reportComment(c1.id, 'spam', other);
    await expect(service.resolveReports(c1.id, 'any', elsewhere)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(service.resolveReports(c1.id, 'any', other)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(reports[0]?.resolvedAt).toBeNull();
    await service.resolveReports(c1.id, 'any', staff);
    expect(reports[0]).toMatchObject({ resolution: 'dismissed', resolvedBy: staff.id });
  });

  it('lists the comments of the courses the actor moderates, and refuses anyone who moderates none', async () => {
    const { service, c1, c2 } = await seeded();
    expect((await service.listComments(q(), staff)).rows.map((row) => row.id)).toEqual([c1.id]);
    expect((await service.listComments(q(), elsewhere)).rows.map((row) => row.id)).toEqual([c2.id]);
    expect((await service.listComments(q(), moderator)).rows).toHaveLength(2);
    await expect(service.listComments(q(), learner)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('skips review for a moderator of the course where they post, and only there', async () => {
    const { service, settings } = await openCourse();
    await setSettings(settings, 'c1', { requireReview: true });
    await setSettings(settings, 'c2', { enabled: true, requireReview: true });
    const post = (activityId: string, actor: Actor) =>
      service.postComment({ activityId, parentId: null, body: 'x' }, actor);
    expect((await post('a1', staff)).status).toBe('published');
    expect((await post('b1', staff)).status).toBe('pending');
    expect((await post('a1', elsewhere)).status).toBe('pending');
    expect((await post('b1', elsewhere)).status).toBe('published');
    expect((await post('a1', learner)).status).toBe('pending');
  });
});

describe('team on lesson comments', () => {
  it('shows James as team in Spanish Basics and not in Spanish Grammar', async () => {
    const { service, settings } = await openCourse();
    await setSettings(settings, 'c2', { enabled: true });
    const james = person({
      id: 'ou_james',
      content: { c1: ['courses:read', 'courses:write', 'courses:moderate'] },
      contentRoles: { c1: INSTRUCTOR },
    });
    const basics = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'hola' },
      james,
    );
    const grammar = await service.postComment(
      { activityId: 'b1', parentId: null, body: 'hola' },
      james,
    );
    expect(basics.author).toMatchObject({ team: true, roleName: 'Instructor' });
    expect(grammar.author).toMatchObject({ team: false, roleName: null });
    expect((await service.activityComments('a1', learner)).comments[0]?.author).toMatchObject({
      team: true,
      roleName: 'Instructor',
    });
    expect((await service.activityComments('b1', learner)).comments[0]?.author).toMatchObject({
      team: false,
      roleName: null,
    });
    const listed = await service.listComments(q(), moderator);
    expect(listed.rows.map((row) => [row.courseId, row.author.team, row.author.roleName])).toEqual(
      expect.arrayContaining([
        ['c1', true, 'Instructor'],
        ['c2', false, null],
      ]),
    );
  });

  it('badges a person whose org role is team on every course', async () => {
    const { service } = await openCourse();
    const sarah = person({
      id: 'ou_sarah',
      owner: true,
      orgRole: { key: 'owner', name: 'Owner', team: true },
    });
    const view = await service.postComment({ activityId: 'a1', parentId: null, body: 'hi' }, sarah);
    expect(view.author).toMatchObject({ team: true, roleName: 'Owner' });
  });
});

describe('comment mentions on an activity', () => {
  const data = (event: NewDiscussionEvent | undefined) =>
    event?.data as { mentionedOrgUserIds?: string[] } | undefined;

  it('keeps the people who can open the course, and carries them when published', async () => {
    const { service, appended, mentions, bar } = await openCourse();
    bar('ou_barred', 'c1');
    const view = await service.postComment(
      {
        activityId: 'a1',
        parentId: null,
        body: 'Thanks <@ou_other>, <@ou_barred> and <@ou_staff>',
      },
      learner,
    );
    expect(data(appended.at(-1))?.mentionedOrgUserIds).toEqual([other.id, staff.id]);
    expect(mentions.rows.map((row) => row.orgUserId)).toEqual([other.id, staff.id]);
    expect(view.mentions.map((mention) => mention.orgUserId)).toEqual([other.id, staff.id]);
  });

  it('carries no one for a pending comment and the mentions at approval', async () => {
    const { service, appended, settings, bar } = await openCourse();
    await setSettings(settings, 'c1', { requireReview: true });
    const c = await service.postComment(
      { activityId: 'a1', parentId: null, body: '<@ou_other> <@ou_late>' },
      learner,
    );
    expect(appended.at(-1)?.type).toBe('discussion.comment.created');
    expect(data(appended.at(-1))?.mentionedOrgUserIds).toEqual([]);
    bar('ou_late', 'c1');
    await service.approve(c.id, staff);
    expect(appended.at(-1)?.type).toBe('discussion.comment.published');
    expect(data(appended.at(-1))?.mentionedOrgUserIds).toEqual([other.id]);
  });

  it('names the actor on every event of a comment on an activity, the approving moderator included', async () => {
    const { service, appended, settings } = await openCourse();
    await setSettings(settings, 'c1', { requireReview: true });
    const c = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'first' },
      learner,
    );
    expect(appended.at(-1)).toMatchObject({
      type: 'discussion.comment.created',
      metadata: { actorId: learner.id },
    });
    await service.approve(c.id, staff);
    expect(appended.at(-1)).toMatchObject({
      type: 'discussion.comment.published',
      metadata: { actorId: staff.id },
    });
    await service.edit(c.id, 'edited', learner);
    expect(appended.at(-1)).toMatchObject({
      type: 'discussion.comment.updated',
      metadata: { actorId: learner.id },
    });
    await service.reportComment(c.id, 'spam', other);
    expect(appended.at(-1)).toMatchObject({
      type: 'discussion.comment.reported',
      metadata: { actorId: other.id },
    });
    await service.remove(c.id, 'any', staff);
    expect(appended.at(-1)).toMatchObject({
      type: 'discussion.comment.removed',
      metadata: { actorId: staff.id },
    });
  });

  it('serves a removed comment without its mentions', async () => {
    const { service } = await openCourse();
    const c = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'hi <@ou_other>' },
      learner,
    );
    expect((await service.remove(c.id, 'any', staff)).mentions).toEqual([]);
    expect((await service.restore(c.id, 'any', staff)).mentions).toEqual([
      { orgUserId: other.id, name: other.id },
    ]);
  });
});

describe('comment events', () => {
  const lastOf = (appended: NewDiscussionEvent[], type: string) =>
    appended.filter((event) => event.type === type).at(-1);

  it('announces only a person’s first reaction to a comment on an activity', async () => {
    const { service, appended } = await openCourse();
    const c = await service.postComment({ activityId: 'a1', parentId: null, body: 'a' }, learner);
    await service.setReaction(c.id, '👍', other);
    await service.setReaction(c.id, '🎉', other);
    await service.setReaction(c.id, null, other);
    const added = appended.filter((event) => event.type === 'discussion.comment.reaction.added');
    expect(added).toHaveLength(1);
    expect(added[0]?.data).toEqual({
      commentId: c.id,
      postId: null,
      activityId: 'a1',
      spaceId: null,
      communityId: null,
      orgUserId: other.id,
      reaction: '👍',
    });
  });

  it('announces an edit, carrying the newly mentioned only while published', async () => {
    const { service, appended, settings } = await openCourse();
    const c = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'hi <@ou_other>' },
      learner,
    );
    await service.edit(c.id, 'hi <@ou_other> <@ou_staff>', learner);
    expect(lastOf(appended, 'discussion.comment.updated')?.data).toMatchObject({
      id: c.id,
      body: 'hi <@ou_other> <@ou_staff>',
      mentionedOrgUserIds: [staff.id],
    });
    await setSettings(settings, 'c1', { requireReview: true });
    const held = await service.postComment(
      { activityId: 'a1', parentId: null, body: 'held' },
      learner,
    );
    await service.edit(held.id, 'held <@ou_other>', learner);
    expect(lastOf(appended, 'discussion.comment.updated')?.data).toMatchObject({
      id: held.id,
      mentionedOrgUserIds: [],
    });
    await service.approve(held.id, staff);
    expect(lastOf(appended, 'discussion.comment.published')?.data).toMatchObject({
      mentionedOrgUserIds: [other.id],
    });
  });
});
