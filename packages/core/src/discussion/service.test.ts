import { describe, it, expect } from 'vitest';
import { DiscussionServiceImpl, DEFAULT_SETTINGS } from './service.js';
import type {
  Actor,
  ActivityGetter,
  AuthorRecord,
  CommentReactions,
  CommentWithContext,
  CourseAccessReader,
  DiscussionRepository,
  DiscussionUnitOfWork,
} from './ports.js';
import type { ActivityCommentsRule, Comment, CommentReport, CommentSettings } from './model.js';
import type { NewDiscussionEvent } from './events.js';
import type { ListCommentsQuery, ReactionEmoji } from './types.js';
import type { CommunityReader } from '../content/index.js';
import { NotFoundError, ForbiddenError } from '../shared/errors.js';
import {
  SettingsNamespace,
  SettingsService,
  type SettingsRecord,
  type SettingsRepository,
} from '../shared/settings.js';

function q(filters: Partial<ListCommentsQuery> = {}): ListCommentsQuery {
  return { page: 1, pageSize: 20, ...filters };
}

const learner: Actor = { id: 'ou_learner', role: 'student' };
const other: Actor = { id: 'ou_other', role: 'student' };
const staff: Actor = { id: 'ou_staff', role: 'instructor' };

/** Every activity belongs to course c1 unless a test says otherwise. */
export function fakeRepo() {
  const comments: Comment[] = [];
  const reactions: { commentId: string; orgUserId: string; type: ReactionEmoji }[] = [];
  const reports: CommentReport[] = [];
  const authors = new Map<string, AuthorRecord>();
  const activityCourse = new Map<string, string>([
    ['a1', 'c1'],
    ['a2', 'c1'],
  ]);
  const activityTitle = new Map<string, string>([
    ['a1', 'Lesson one'],
    ['a2', 'Lesson two'],
  ]);

  function author(id: string): AuthorRecord {
    return (
      authors.get(id) ?? {
        id,
        firstName: id,
        lastName: null,
        image: null,
        role: id === staff.id ? 'instructor' : 'student',
        email: `${id}@example.test`,
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
    async listByPost(orgId, postId) {
      return comments
        .filter((c) => c.orgId === orgId && c.postId === postId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((c) => ({ ...c }));
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
    async listComments(orgId, query) {
      const open = new Set(reports.filter((r) => !r.resolvedAt).map((r) => r.commentId));
      const matched = comments
        .filter((c) => c.orgId === orgId)
        .map(withContext)
        .filter((e) => {
          const c = e.comment;
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

export function fakeUow(repo: DiscussionRepository) {
  const appended: NewDiscussionEvent[] = [];
  const uow: DiscussionUnitOfWork = {
    run: (fn) =>
      fn({
        discussion: repo,
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
  const access: CourseAccessReader & { canOpenSpace: () => Promise<boolean> } = {
    async hasCourseAccess(_orgId, orgUserId, courseId) {
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
): ActivityGetter & Pick<CommunityReader, 'getSpace'> {
  return {
    async getActivity(_orgId, activityId) {
      const courseId = activityCourse.get(activityId);
      return courseId
        ? ({ id: activityId, courseId, settings: activitySettings.get(activityId) ?? {} } as never)
        : null;
    },
    async getSpace() {
      return null;
    },
  };
}

export function makeService(fake = fakeRepo(), gate = fakeAccess()) {
  const { uow, appended } = fakeUow(fake.repo);
  const { settings, rows } = fakeSettings();
  const activitySettings = new Map<string, unknown>();
  const service = new DiscussionServiceImpl({
    repo: fake.repo,
    access: gate.access,
    content: fakeContent(fake.activityCourse, activitySettings),
    posts: { find: async () => null },
    uow,
    settings,
  });
  return {
    service,
    appended,
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

describe('settings', () => {
  it('is off for a course that has never been configured', async () => {
    const { service } = makeService();
    const config = await service.resolveConfig('o1', 'a1');
    expect(config.enabled).toBe(false);
  });

  it('reads comment settings from under the course settings `comments` key', async () => {
    const { service, settings } = makeService();
    await setSettings(settings, 'c1', { enabled: true, requireReview: true });
    const config = await service.resolveConfig('o1', 'a1');
    expect(config.enabled).toBe(true);
    expect(config.requireReview).toBe(true);
  });

  it('ignores sibling course settings that are not about comments', async () => {
    const { service, settings } = makeService();
    await settings.patch('o1', SettingsNamespace.content, 'c1', {
      transcriptDownloads: true,
      comments: { ...DEFAULT_SETTINGS, enabled: true },
    });
    const config = await service.resolveConfig('o1', 'a1');
    expect(config.enabled).toBe(true);
  });

  it('applies an activity override on top of the course settings', async () => {
    const { service, activitySettings } = await openCourse();
    setActivityComments(activitySettings, 'a1', 'never');
    expect((await service.resolveConfig('o1', 'a1')).enabled).toBe(false);
    expect((await service.resolveConfig('o1', 'a2')).enabled).toBe(true);
  });

  it('cannot be turned back on for an activity once the course switches it off', async () => {
    const { service, settings, activitySettings } = makeService();
    await setSettings(settings, 'c1', { enabled: false });
    setActivityComments(activitySettings, 'a1', 'always');
    expect((await service.resolveConfig('o1', 'a1')).enabled).toBe(false);
  });
});

describe('post', () => {
  it('publishes a learner comment when review is not required', async () => {
    const { service } = await openCourse();
    const view = await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'hello',
    });
    expect(view.status).toBe('published');
    expect(view.author.id).toBe(learner.id);
    expect(view.activityId).toBe('a1');
    expect(view.reactions).toEqual({});
    expect(view.viewerReaction).toBeUndefined();
  });

  it('holds a learner comment pending when the course requires review', async () => {
    const { service, settings } = await openCourse();
    await setSettings(settings, 'c1', { requireReview: true });
    const view = await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'hello',
    });
    expect(view.status).toBe('pending');
  });

  it('publishes a staff comment even when review is required', async () => {
    const { service, settings } = await openCourse();
    await setSettings(settings, 'c1', { requireReview: true });
    const view = await service.postComment('o1', {
      actor: staff,
      activityId: 'a1',
      parentId: null,
      body: 'hello',
    });
    expect(view.status).toBe('published');
  });

  it('emits comment.created in the same transaction as the row', async () => {
    const { service, appended } = await openCourse();
    await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'hello',
    });
    expect(appended.map((e) => e.type)).toEqual(['discussion.comment.created']);
  });

  it('refuses to post when the activity has comments switched off', async () => {
    const { service, activitySettings } = await openCourse();
    setActivityComments(activitySettings, 'a1', 'never');
    await expect(
      service.postComment('o1', { actor: learner, activityId: 'a1', parentId: null, body: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses to post for a learner without access to the course', async () => {
    const s = await openCourse();
    s.bar(learner.id, 'c1');
    await expect(
      s.service.postComment('o1', { actor: learner, activityId: 'a1', parentId: null, body: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lets staff post without a grant', async () => {
    const s = await openCourse();
    s.bar(staff.id, 'c1');
    const view = await s.service.postComment('o1', {
      actor: staff,
      activityId: 'a1',
      parentId: null,
      body: 'x',
    });
    expect(view.body).toBe('x');
  });

  it('refuses a reply when the course is not threaded', async () => {
    const { service, settings } = await openCourse();
    const root = await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'root',
    });
    await setSettings(settings, 'c1', { threaded: false });
    await expect(
      service.postComment('o1', {
        actor: learner,
        activityId: 'a1',
        parentId: root.id,
        body: 'reply',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses to nest a reply below a reply', async () => {
    const { service } = await openCourse();
    const root = await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'root',
    });
    const reply = await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: root.id,
      body: 'reply',
    });
    await expect(
      service.postComment('o1', {
        actor: learner,
        activityId: 'a1',
        parentId: reply.id,
        body: 'deeper',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses a reply to a comment on another activity', async () => {
    const { service } = await openCourse();
    const root = await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'root',
    });
    await expect(
      service.postComment('o1', {
        actor: learner,
        activityId: 'a2',
        parentId: root.id,
        body: 'reply',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses a reply to a comment that is not published', async () => {
    const { service, settings } = await openCourse();
    await setSettings(settings, 'c1', { requireReview: true });
    const pending = await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'root',
    });
    await expect(
      service.postComment('o1', {
        actor: other,
        activityId: 'a1',
        parentId: pending.id,
        body: 'reply',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('activityComments', () => {
  it('serves nothing at all when the activity has comments switched off', async () => {
    const { service, activitySettings } = await openCourse();
    setActivityComments(activitySettings, 'a1', 'never');
    const { config, comments } = await service.activityComments('o1', 'a1', learner);
    expect(config.enabled).toBe(false);
    expect(comments).toEqual([]);
  });

  it('names the author and resolves their current role', async () => {
    const { service } = await openCourse();
    await service.postComment('o1', {
      actor: staff,
      activityId: 'a1',
      parentId: null,
      body: 'hello',
    });
    const { comments } = await service.activityComments('o1', 'a1', learner);
    expect(comments[0]?.author.id).toBe(staff.id);
    expect(comments[0]?.author.role).toBe('instructor');
  });

  it('never serves an author email', async () => {
    const { service } = await openCourse();
    await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'hello',
    });
    const { comments } = await service.activityComments('o1', 'a1', learner);
    expect(comments[0]).not.toHaveProperty('authorEmail');
    expect(JSON.stringify(comments[0]?.author)).not.toContain('@');
  });

  it('shows a pending comment to its author and to staff, nobody else', async () => {
    const { service, settings } = await openCourse();
    await setSettings(settings, 'c1', { requireReview: true });
    await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'held',
    });
    expect((await service.activityComments('o1', 'a1', learner)).comments).toHaveLength(1);
    expect((await service.activityComments('o1', 'a1', staff)).comments).toHaveLength(1);
    expect((await service.activityComments('o1', 'a1', other)).comments).toHaveLength(0);
  });

  it('nulls a removed comment body but still names who removed it', async () => {
    const { service } = await openCourse();
    const root = await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'root',
    });
    await service.postComment('o1', {
      actor: other,
      activityId: 'a1',
      parentId: root.id,
      body: 'reply',
    });
    await service.remove('o1', root.id, staff);

    const { comments } = await service.activityComments('o1', 'a1', learner);
    const placeholder = comments.find((c) => c.id === root.id);
    expect(placeholder?.body).toBeNull();
    expect(placeholder?.removedBy?.id).toBe(staff.id);
  });

  it('drops a removed root once no visible reply holds it open', async () => {
    const { service } = await openCourse();
    const root = await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'root',
    });
    await service.remove('o1', root.id, learner);
    expect((await service.activityComments('o1', 'a1', learner)).comments).toHaveLength(0);
  });

  it('never serves a removed reply', async () => {
    const { service } = await openCourse();
    const root = await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'root',
    });
    const reply = await service.postComment('o1', {
      actor: other,
      activityId: 'a1',
      parentId: root.id,
      body: 'reply',
    });
    await service.remove('o1', reply.id, other);
    const { comments } = await service.activityComments('o1', 'a1', learner);
    expect(comments.map((c) => c.id)).toEqual([root.id]);
  });

  it('judges a removed root against replies THIS reader can see', async () => {
    const { service, settings } = await openCourse();
    await setSettings(settings, 'c1', { requireReview: true });
    const root = await service.postComment('o1', {
      actor: staff,
      activityId: 'a1',
      parentId: null,
      body: 'root',
    });
    await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: root.id,
      body: 'pending reply',
    });
    await service.remove('o1', root.id, staff);

    expect((await service.activityComments('o1', 'a1', learner)).comments).toHaveLength(2);
    expect((await service.activityComments('o1', 'a1', other)).comments).toHaveLength(0);
  });

  it('serves reaction counts with the reader own kind marked', async () => {
    const { service } = await openCourse();
    const c = await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'hello',
    });
    await service.setReaction('o1', c.id, learner, 'like');
    await service.setReaction('o1', c.id, other, 'like');
    await service.setReaction('o1', c.id, staff, 'curious');

    const mine = (await service.activityComments('o1', 'a1', learner)).comments[0];
    expect(mine?.reactions).toEqual({ like: 2, curious: 1 });
    expect(mine?.viewerReaction).toBe('like');

    const theirs = (await service.activityComments('o1', 'a1', staff)).comments[0];
    expect(theirs?.reactions).toEqual({ like: 2, curious: 1 });
    expect(theirs?.viewerReaction).toBe('curious');
  });

  it('leaves viewerReaction absent for a reader who has not reacted', async () => {
    const { service } = await openCourse();
    const c = await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'hello',
    });
    await service.setReaction('o1', c.id, other, 'like');
    const view = (await service.activityComments('o1', 'a1', learner)).comments[0];
    expect(view?.viewerReaction).toBeUndefined();
  });

  it('serves no reaction counts at all when the course disables reactions', async () => {
    const { service, settings } = await openCourse();
    const c = await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'hello',
    });
    await service.setReaction('o1', c.id, learner, 'like');
    await setSettings(settings, 'c1', { reactions: false });
    const view = (await service.activityComments('o1', 'a1', learner)).comments[0];
    expect(view?.reactions).toEqual({});
    expect(view?.viewerReaction).toBeUndefined();
  });

  it('throws rather than serving a comment whose author has vanished', async () => {
    const fake = fakeRepo();
    const s = makeService(fake);
    await setSettings(s.settings, 'c1', { enabled: true });
    await s.service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'hello',
    });
    fake.repo.authorsOf = async () => ({});
    await expect(s.service.activityComments('o1', 'a1', learner)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('edit, remove, restore, approve', () => {
  it('lets the author revise their own comment', async () => {
    const { service } = await openCourse();
    const c = await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'first',
    });
    const edited = await service.edit('o1', c.id, learner, 'second');
    expect(edited.body).toBe('second');
  });

  it('refuses an edit by anyone else, staff included', async () => {
    const { service } = await openCourse();
    const c = await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'first',
    });
    await expect(service.edit('o1', c.id, staff, 'x')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses to edit a removed comment', async () => {
    const { service } = await openCourse();
    const c = await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'first',
    });
    await service.remove('o1', c.id, learner);
    await expect(service.edit('o1', c.id, learner, 'x')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lets the author or a moderator remove, but not a bystander', async () => {
    const { service } = await openCourse();
    const mine = await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'a',
    });
    const theirs = await service.postComment('o1', {
      actor: other,
      activityId: 'a1',
      parentId: null,
      body: 'b',
    });
    expect((await service.remove('o1', mine.id, learner)).status).toBe('removed');
    expect((await service.remove('o1', theirs.id, staff)).status).toBe('removed');

    const third = await service.postComment('o1', {
      actor: other,
      activityId: 'a1',
      parentId: null,
      body: 'c',
    });
    await expect(service.remove('o1', third.id, learner)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('emits comment.removed once, and is idempotent on a second removal', async () => {
    const { service, appended } = await openCourse();
    const c = await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'a',
    });
    await service.remove('o1', c.id, learner);
    await service.remove('o1', c.id, learner);
    expect(appended.filter((e) => e.type === 'discussion.comment.removed')).toHaveLength(1);
  });

  it('lets only a moderator restore or approve', async () => {
    const { service, settings } = await openCourse();
    await setSettings(settings, 'c1', { requireReview: true });
    const c = await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'a',
    });
    await expect(service.approve('o1', c.id, learner)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await service.approve('o1', c.id, staff)).status).toBe('published');

    await service.remove('o1', c.id, staff);
    await expect(service.restore('o1', c.id, learner)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await service.restore('o1', c.id, staff)).status).toBe('published');
  });

  it('refuses to approve a comment that is not pending', async () => {
    const { service } = await openCourse();
    const c = await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'a',
    });
    await expect(service.approve('o1', c.id, staff)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('clears removedBy when a comment is restored', async () => {
    const { service } = await openCourse();
    const c = await service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'a',
    });
    await service.remove('o1', c.id, staff);
    expect((await service.restore('o1', c.id, staff)).removedBy).toBeNull();
  });

  it('throws for a comment that does not exist', async () => {
    const { service } = await openCourse();
    await expect(service.remove('o1', 'nope', staff)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.edit('o1', 'nope', learner, 'x')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('reactions', () => {
  async function seeded() {
    const s = await openCourse();
    const c = await s.service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'hello',
    });
    return { ...s, commentId: c.id };
  }

  it('returns the whole state so the caller never recomputes a count', async () => {
    const { service, commentId } = await seeded();
    const state = await service.setReaction('o1', commentId, learner, 'like');
    expect(state).toEqual({ reactions: { like: 1 }, viewerReaction: 'like' });
  });

  it('replaces rather than accumulates when a reader reacts again', async () => {
    const { service, commentId } = await seeded();
    await service.setReaction('o1', commentId, learner, 'like');
    const state = await service.setReaction('o1', commentId, learner, 'curious');
    expect(state).toEqual({ reactions: { curious: 1 }, viewerReaction: 'curious' });
  });

  it('is a no-op rather than a toggle when the same kind arrives twice', async () => {
    const { service, commentId } = await seeded();
    await service.setReaction('o1', commentId, learner, 'like');
    const state = await service.setReaction('o1', commentId, learner, 'like');
    expect(state).toEqual({ reactions: { like: 1 }, viewerReaction: 'like' });
  });

  it('clears, leaving everyone else counted', async () => {
    const { service, commentId } = await seeded();
    await service.setReaction('o1', commentId, learner, 'like');
    await service.setReaction('o1', commentId, other, 'like');
    const state = await service.setReaction('o1', commentId, learner, null);
    expect(state).toEqual({ reactions: { like: 1 } });
    expect(state.viewerReaction).toBeUndefined();
  });

  it('refuses a new reaction when the course disables reactions', async () => {
    const { service, settings, commentId } = await seeded();
    await setSettings(settings, 'c1', { reactions: false });
    await expect(service.setReaction('o1', commentId, learner, 'like')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('still lets a reader withdraw one after reactions are switched off', async () => {
    const { service, settings, commentId } = await seeded();
    await service.setReaction('o1', commentId, learner, 'like');
    await setSettings(settings, 'c1', { reactions: false });
    await expect(service.setReaction('o1', commentId, learner, null)).resolves.toEqual({
      reactions: {},
    });
  });

  it('refuses when the activity has comments switched off', async () => {
    const { service, activitySettings, commentId } = await seeded();
    setActivityComments(activitySettings, 'a1', 'never');
    await expect(service.setReaction('o1', commentId, learner, 'like')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('refuses on a removed comment', async () => {
    const { service, commentId } = await seeded();
    await service.remove('o1', commentId, staff);
    await expect(service.setReaction('o1', commentId, learner, 'like')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe('reports', () => {
  async function seeded() {
    const s = await openCourse();
    const c = await s.service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'hello',
    });
    return { ...s, commentId: c.id };
  }

  it('records a report and emits comment.reported', async () => {
    const { service, appended, commentId } = await seeded();
    const report = await service.reportComment('o1', commentId, other, 'spam');
    expect(report.reason).toBe('spam');
    expect(appended.filter((e) => e.type === 'discussion.comment.reported')).toHaveLength(1);
  });

  it('returns the existing report and emits nothing on a duplicate', async () => {
    const { service, appended, commentId } = await seeded();
    const first = await service.reportComment('o1', commentId, other, 'spam');
    const second = await service.reportComment('o1', commentId, other, 'again');
    expect(second.id).toBe(first.id);
    expect(appended.filter((e) => e.type === 'discussion.comment.reported')).toHaveLength(1);
  });

  it('refuses a report on an activity with comments switched off', async () => {
    const { service, activitySettings, commentId } = await seeded();
    setActivityComments(activitySettings, 'a1', 'never');
    await expect(service.reportComment('o1', commentId, other, 'spam')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('closes every open report on a comment', async () => {
    const { service, reports, commentId } = await seeded();
    await service.reportComment('o1', commentId, other, 'spam');
    await service.resolveReports('o1', commentId, staff);
    expect(reports.every((r) => r.resolvedAt !== null)).toBe(true);
  });

  it('refuses to close reports for a learner', async () => {
    const { service, commentId } = await seeded();
    await service.reportComment('o1', commentId, other, 'spam');
    await expect(service.resolveReports('o1', commentId, learner)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe('listComments', () => {
  async function seeded() {
    const s = await openCourse();
    const a = await s.service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'first post',
    });
    const b = await s.service.postComment('o1', {
      actor: other,
      activityId: 'a2',
      parentId: null,
      body: 'second post',
    });
    return { ...s, a, b };
  }

  it('carries the course and activity title a moderation card needs', async () => {
    const { service } = await seeded();
    const page = await service.listComments('o1', q({ activityId: 'a1' }));
    expect(page.rows[0]?.courseId).toBe('c1');
    expect(page.rows[0]?.activityTitle).toBe('Lesson one');
  });

  it('carries the author email, which a reader is never given', async () => {
    const { service } = await seeded();
    const page = await service.listComments('o1', q({ activityId: 'a1' }));
    expect(page.rows[0]?.authorEmail).toBe(`${learner.id}@example.test`);
    expect(page.rows[0]?.author.id).toBe(learner.id);
  });

  it('serves a removed comment with its body, which a reader is never given', async () => {
    const { service, a } = await seeded();
    await service.remove('o1', a.id, staff);
    const page = await service.listComments('o1', q({ activityId: 'a1' }));
    expect(page.rows[0]?.body).toBe('first post');
    expect(page.rows[0]?.status).toBe('removed');
    expect(page.rows[0]?.removedBy).toBe(staff.id);
  });

  it('attaches open reports with the reporter named', async () => {
    const { service, a } = await seeded();
    await service.reportComment('o1', a.id, other, 'spam');
    const page = await service.listComments('o1', q({ activityId: 'a1' }));
    expect(page.rows[0]?.reports).toHaveLength(1);
    expect(page.rows[0]?.reports[0]?.reporter.id).toBe(other.id);
    expect(page.rows[0]?.reports[0]?.reason).toBe('spam');
  });

  it('leaves reports empty on a comment nobody has flagged', async () => {
    const { service } = await seeded();
    const page = await service.listComments('o1', q({ activityId: 'a2' }));
    expect(page.rows[0]?.reports).toEqual([]);
  });

  it('narrows by author, activity and body search', async () => {
    const { service } = await seeded();
    expect((await service.listComments('o1', q({ orgUserId: other.id }))).rows).toHaveLength(1);
    expect((await service.listComments('o1', q({ activityId: 'a2' }))).rows).toHaveLength(1);
    expect((await service.listComments('o1', q({ search: 'second' }))).rows).toHaveLength(1);
  });

  it('narrows to comments carrying an open report, or to those carrying none', async () => {
    const { service, a } = await seeded();
    await service.reportComment('o1', a.id, other, 'spam');
    expect((await service.listComments('o1', q({ reported: true }))).rows.map((r) => r.id)).toEqual(
      [a.id],
    );
    expect((await service.listComments('o1', q({ reported: false }))).rows).toHaveLength(1);
  });

  it('returns an empty page without looking anyone up', async () => {
    const { service } = await openCourse();
    const page = await service.listComments('o1', q());
    expect(page.rows).toEqual([]);
    expect(page.total).toBe(0);
  });

  it('throws rather than serving a blank author placeholder', async () => {
    const fake = fakeRepo();
    const s = makeService(fake);
    await setSettings(s.settings, 'c1', { enabled: true });
    await s.service.postComment('o1', {
      actor: learner,
      activityId: 'a1',
      parentId: null,
      body: 'hello',
    });
    fake.repo.authorsOf = async () => ({});
    await expect(s.service.listComments('o1', q())).rejects.toBeInstanceOf(NotFoundError);
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

  function postService(commentsClosed: boolean | null = null) {
    const fake = fakeRepo();
    const { uow, appended } = fakeUow(fake.repo);
    const { settings } = fakeSettings();
    const gate = fakeAccess();
    const service = new DiscussionServiceImpl({
      repo: fake.repo,
      access: { ...gate.access, canOpenSpace: async () => true },
      content: {
        ...fakeContent(fake.activityCourse, new Map()),
        getSpace: async () => space,
      },
      posts: { find: async () => ({ ...post, commentsClosed }) },
      uow,
      settings,
    });
    return { service, appended };
  }

  it('is created published and does not emit comment.published', async () => {
    const { service, appended } = postService();
    const view = await service.postComment('o1', {
      actor: learner,
      postId: 'pst_1',
      parentId: null,
      body: 'hi',
    });
    expect(view.status).toBe('published');
    expect(view.activityId).toBeNull();
    expect(view.postId).toBe('pst_1');
    expect(view.communityId).toBe('cmy_1');
    expect(appended.map((event) => event.type)).toEqual(['discussion.comment.created']);
  });

  it('refuses a comment when the post has comments closed', async () => {
    const { service } = postService(true);
    await expect(
      service.postComment('o1', { actor: learner, postId: 'pst_1', parentId: null, body: 'hi' }),
    ).rejects.toThrow('Comments are closed on this post');
  });
});

describe('course access', () => {
  it('lets staff reach an activity without a course entitlement', async () => {
    const { service, bar } = await openCourse();
    bar(staff.id, 'c1');
    await expect(
      service.postComment('o1', { actor: staff, activityId: 'a1', parentId: null, body: 'x' }),
    ).resolves.toBeDefined();
  });
});
