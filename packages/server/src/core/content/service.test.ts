import { describe, it, expect, vi } from 'vitest';
import { NotFoundError } from '../shared/errors.js';
import { ContentServiceImpl } from './service.js';
import type { ContentRepository, CourseRepository, ContentUnitOfWork } from './ports.js';
import type { Course, Module } from './model.js';
import type { NewDomainEvent, OutboxAppender } from '../shared/ports.js';

function makeCourse(over: Partial<Course> = {}): Course {
  return {
    id: 'c1',
    title: 'Intro',
    slug: 'intro',
    description: '',
    status: 'draft',
    category: '',
    moduleCount: 0,
    activityCount: 0,
    enrolledCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function makeRepo(): ContentRepository {
  return {
    list: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

function makeStructureRepo(): CourseRepository {
  return {
    listForCourse: vi.fn(),
    reorderModules: vi.fn(),
    createModule: vi.fn(),
    updateModule: vi.fn(),
    deleteModule: vi.fn(),
    reorderActivities: vi.fn(),
    saveActivity: vi.fn(),
    deleteActivity: vi.fn(),
  };
}

/** Pass-through unit of work: runs the callback with the fake repo as the
 *  tx-bound scope plus a capturing outbox appender. */
function fakeUow(repo: ContentRepository) {
  const appended: NewDomainEvent[] = [];
  const append = vi.fn(async (events: NewDomainEvent[]) => {
    appended.push(...events);
  });
  const outbox: OutboxAppender = { append };
  const uow: ContentUnitOfWork = {
    run: (fn) => fn({ courses: repo, outbox }),
  };
  return { uow, append, appended };
}

function build(repo = makeRepo(), structure = makeStructureRepo()) {
  const { uow, append, appended } = fakeUow(repo);
  const svc = new ContentServiceImpl(repo, structure, uow);
  return { svc, repo, structure, append, appended };
}

describe('ContentServiceImpl', () => {
  it('derives the slug from the title on create', async () => {
    const repo = makeRepo();
    const created = makeCourse({ title: 'My New Course', slug: 'my-new-course' });
    (repo.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);

    const { svc } = build(repo);
    const result = await svc.create('org1', { title: 'My New Course' });

    expect(repo.create).toHaveBeenCalledWith('org1', { title: 'My New Course' }, 'my-new-course');
    expect(result).toBe(created);
  });

  it('delegates course reads to the content repository', async () => {
    const repo = makeRepo();
    const course = makeCourse();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(course);

    const { svc, append } = build(repo);
    const result = await svc.get('org1', 'c1');

    expect(repo.findById).toHaveBeenCalledWith('org1', 'c1');
    expect(result).toBe(course);
    expect(append).not.toHaveBeenCalled();
  });

  it('appends course.created (org + full snapshot) inside the unit of work', async () => {
    const repo = makeRepo();
    const created = makeCourse();
    (repo.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);

    const { svc, appended } = build(repo);
    await svc.create('org1', { title: 'Intro' });

    expect(appended).toEqual([{ type: 'course.created', orgId: 'org1', course: created }]);
  });

  it('appends course.updated with the updated snapshot', async () => {
    const repo = makeRepo();
    const updated = makeCourse({ title: 'Renamed' });
    (repo.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

    const { svc, appended } = build(repo);
    const result = await svc.update('org1', 'c1', { title: 'Renamed' });

    expect(repo.update).toHaveBeenCalledWith('org1', 'c1', { title: 'Renamed' });
    expect(result).toBe(updated);
    expect(appended).toEqual([{ type: 'course.updated', orgId: 'org1', course: updated }]);
  });

  it('throws NotFoundError and appends nothing when update finds no course', async () => {
    const repo = makeRepo();
    (repo.update as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { svc, append } = build(repo);
    await expect(svc.update('org1', 'missing', { title: 'X' })).rejects.toThrow(NotFoundError);
    expect(append).not.toHaveBeenCalled();
  });

  it('appends course.deleted with the pre-delete snapshot', async () => {
    const repo = makeRepo();
    const course = makeCourse();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(course);
    (repo.delete as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const { svc, appended } = build(repo);
    await svc.remove('org1', 'c1');

    expect(appended).toEqual([{ type: 'course.deleted', orgId: 'org1', course }]);
  });

  it('throws NotFoundError and appends nothing when remove finds no course', async () => {
    const repo = makeRepo();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { svc, repo: r, append } = build(repo);
    await expect(svc.remove('org1', 'missing')).rejects.toThrow(NotFoundError);
    expect(r.delete).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the course vanishes between snapshot and delete', async () => {
    const repo = makeRepo();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCourse());
    (repo.delete as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const { svc, append } = build(repo);
    await expect(svc.remove('org1', 'c1')).rejects.toThrow(NotFoundError);
    expect(append).not.toHaveBeenCalled();
  });

  it('does not append when the write fails — the error propagates out of run', async () => {
    const repo = makeRepo();
    (repo.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));

    const { svc, append } = build(repo);
    await expect(svc.create('org1', { title: 'Intro' })).rejects.toThrow('boom');
    expect(append).not.toHaveBeenCalled();
  });

  it('delegates structure writes to the structure repository without appending events', async () => {
    const structure = makeStructureRepo();
    const modules: Module[] = [
      { id: 'm1', courseId: 'c1', title: 'Module 1', seq: 0, activities: [] },
    ];
    (structure.saveActivity as ReturnType<typeof vi.fn>).mockResolvedValue(modules);

    const { svc, append } = build(makeRepo(), structure);
    const result = await svc.saveActivity('org1', 'c1', 'm1', { settings: { title: 'A' } });

    expect(structure.saveActivity).toHaveBeenCalledWith(
      'org1',
      'c1',
      'm1',
      { settings: { title: 'A' } },
      undefined,
    );
    expect(result).toBe(modules);
    expect(append).not.toHaveBeenCalled();
  });

  it('passes an activity id through on update', async () => {
    const structure = makeStructureRepo();
    (structure.saveActivity as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const { svc } = build(makeRepo(), structure);
    await svc.saveActivity('org1', 'c1', 'm1', { assetIds: ['a1'] }, 'act1');

    expect(structure.saveActivity).toHaveBeenCalledWith(
      'org1',
      'c1',
      'm1',
      { assetIds: ['a1'] },
      'act1',
    );
  });
});

describe('logging', () => {
  it('logs course create/update/delete at info with ids', async () => {
    const { createCapturingLogger } = await import('../shared/logger.js');
    const { logger, entries } = createCapturingLogger();
    const repo = makeRepo();
    const course = makeCourse();
    (repo.create as ReturnType<typeof vi.fn>).mockResolvedValue(course);
    (repo.update as ReturnType<typeof vi.fn>).mockResolvedValue(course);
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(course);
    (repo.delete as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const { uow } = fakeUow(repo);
    const svc = new ContentServiceImpl(repo, makeStructureRepo(), uow, logger);

    await svc.create('org-1', { title: 'Intro' });
    await svc.update('org-1', course.id, { title: 'Intro 2' });
    await svc.remove('org-1', course.id);

    expect(entries.filter((e) => e.level === 'info').map((e) => e.msg)).toEqual([
      'course created',
      'course updated',
      'course deleted',
    ]);
    expect(entries[0]?.meta).toMatchObject({ orgId: 'org-1', courseId: course.id });
  });
});
