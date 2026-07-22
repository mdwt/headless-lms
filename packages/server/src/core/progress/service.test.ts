import { describe, it, expect } from 'vitest';
import { ProgressServiceImpl } from './service.js';
import type { ProgressRepository } from './ports.js';
import type { ProgressRecord } from './model.js';
import type { ProgressTarget } from './types.js';
import { createCapturingLogger } from '../shared/logger.js';

function fakeRepo() {
  const records: ProgressRecord[] = [];
  const repo: ProgressRepository = {
    async insert(_orgId, record) {
      records.push(record);
      return record;
    },
    async findByTarget(orgId, target) {
      return (
        records.find(
          (r) =>
            r.orgId === orgId &&
            r.studentId === target.studentId &&
            r.targetType === target.targetType &&
            r.targetId === target.targetId,
        ) ?? null
      );
    },
    async update(orgId, id, patch) {
      const record = records.find((r) => r.orgId === orgId && r.id === id);
      if (!record) {
        return null;
      }
      Object.assign(record, patch);
      return record;
    },
  };
  return { repo, records };
}

const target: ProgressTarget = { studentId: 's1', targetType: 'lesson', targetId: 'l1' };

describe('ProgressService', () => {
  it('recordStart is idempotent per (student, target)', async () => {
    const { repo, records } = fakeRepo();
    const svc = new ProgressServiceImpl(repo, () => '2026-01-01T00:00:00Z');
    const first = await svc.recordStart('org-1', target);
    const second = await svc.recordStart('org-1', target);
    expect(second).toBe(first);
    expect(records).toHaveLength(1);
  });

  it('logs start once, completion at info, position at debug', async () => {
    const { logger, entries } = createCapturingLogger();
    const { repo } = fakeRepo();
    const svc = new ProgressServiceImpl(repo, () => '2026-01-01T00:00:00Z', logger);

    await svc.recordStart('org-1', target);
    await svc.recordStart('org-1', target); // idempotent → no second start log
    await svc.recordPosition('org-1', { ...target, position: { t: 5 } });
    await svc.recordCompletion('org-1', target);

    expect(entries.map((e) => [e.level, e.msg])).toEqual([
      ['info', 'progress started'],
      ['debug', 'position recorded'],
      ['info', 'progress completed'],
    ]);
    expect(entries[0]?.meta).toMatchObject({
      orgId: 'org-1',
      studentId: 's1',
      targetType: 'lesson',
      targetId: 'l1',
    });
  });
});
