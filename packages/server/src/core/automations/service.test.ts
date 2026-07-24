import { describe, it, expect, vi } from 'vitest';
import { AutomationsServiceImpl } from './service.js';
import { InvalidTriggerError } from './model.js';
import type { Automation, AutomationActionResult, AutomationRun } from './model.js';
import type { CreateAutomationInput } from './types.js';
import type {
  AutomationDispatch,
  AutomationEngine,
  AutomationRunsRepository,
  AutomationsRepository,
  AutomationsUnitOfWork,
} from './ports.js';
import type { DomainEvent, NewDomainEvent, OutboxAppender } from '../shared/ports.js';
import type { Entitlement } from '../entitlements/index.js';
import type { IntegrationsService } from '../integrations/index.js';
import type { Mailer } from '../shared/mailer.js';

const SAMPLE_ENTITLEMENT: Entitlement = {
  id: 'e1',
  studentId: 's1',
  firstName: 'Bob',
  lastName: 'Smith',
  studentEmail: 'bob@example.com',
  content: { id: 'c1', type: 'course', title: 'Intro' },
  status: 'active',
  grantedAt: '2026-01-01T00:00:00Z',
  expiresAt: null,
  source: 'manual',
};

const ENTITLEMENT_CREATED_EVENT = {
  type: 'entitlement.created',
  id: 'evt_1',
  orgId: 'org-1',
  createdAt: '2026-01-01T00:00:00Z',
  entitlement: SAMPLE_ENTITLEMENT,
};

const ENTITLEMENT_DELETED_EVENT = {
  type: 'entitlement.deleted',
  id: 'evt_2',
  orgId: 'org-1',
  createdAt: '2026-01-01T00:00:00Z',
  entitlement: SAMPLE_ENTITLEMENT,
};

const AUTOMATION: Automation = {
  id: 'atm_1',
  name: 'Welcome email',
  description: 'Send a welcome email on access grant',
  trigger: 'entitlement.created',
  actions: [{ type: 'sendEmail', template: 'accessGranted' }],
  enabled: true,
};

const DISABLED_AUTOMATION: Automation = { ...AUTOMATION, id: 'atm_2', enabled: false };

const RUN: AutomationRun = {
  id: 'run_1',
  orgId: 'org-1',
  automationId: 'atm_1',
  trigger: 'entitlement.created',
  event: ENTITLEMENT_CREATED_EVENT,
  status: 'running',
  actionResults: [],
  startedAt: '2026-01-02T00:00:00Z',
  finishedAt: null,
};

function fakeRepo(over?: Partial<AutomationsRepository>): AutomationsRepository {
  return {
    insert: vi.fn().mockResolvedValue(AUTOMATION),
    update: vi.fn().mockResolvedValue(AUTOMATION),
    delete: vi.fn().mockResolvedValue(AUTOMATION),
    findById: vi.fn().mockResolvedValue(AUTOMATION),
    listByOrg: vi.fn().mockResolvedValue([AUTOMATION]),
    listByTrigger: vi.fn().mockResolvedValue([AUTOMATION]),
    ...over,
  };
}

function fakeRunsRepo(over?: Partial<AutomationRunsRepository>): AutomationRunsRepository {
  return {
    insert: vi.fn().mockResolvedValue(RUN),
    recordOutcome: vi.fn().mockResolvedValue({ ...RUN, status: 'completed', finishedAt: '2026-01-02T00:00:05Z' }),
    list: vi.fn().mockResolvedValue({ rows: [RUN], total: 1, page: 1, pageSize: 20 }),
    ...over,
  };
}

function fakeEngine(over?: Partial<AutomationEngine>): AutomationEngine {
  return {
    register: vi.fn(),
    dispatch: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

function fakeMailer(over?: Partial<Pick<Mailer, 'send'>>): Pick<Mailer, 'send'> {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

function fakeIntegrations(
  over?: Partial<Pick<IntegrationsService, 'available'>>,
): Pick<IntegrationsService, 'available'> {
  return {
    available: vi.fn().mockReturnValue([]),
    ...over,
  };
}

/** Pass-through unit of work: runs the callback with the fake repos as the
 *  tx-bound scope plus a capturing outbox appender. */
function fakeUow(repo: AutomationsRepository, runsRepo: AutomationRunsRepository) {
  const appended: NewDomainEvent[] = [];
  const append = vi.fn(async (events: NewDomainEvent[]) => {
    appended.push(...events);
  });
  const outbox: OutboxAppender = { append };
  const uow: AutomationsUnitOfWork = {
    run: (fn) => fn({ automations: repo, runs: runsRepo, outbox }),
  };
  return { uow, append, appended };
}

function build(
  repo = fakeRepo(),
  runsRepo = fakeRunsRepo(),
  engine = fakeEngine(),
  mailer = fakeMailer(),
  integrations = fakeIntegrations(),
  now: () => string = () => '2026-01-02T00:00:00Z',
) {
  const { uow, append, appended } = fakeUow(repo, runsRepo);
  const svc = new AutomationsServiceImpl(repo, runsRepo, uow, engine, mailer, integrations, now);
  return { svc, repo, runsRepo, engine, mailer, integrations, append, appended };
}

describe('AutomationsService.handle', () => {
  it("matches an enabled automation's trigger, opens a run, and dispatches it", async () => {
    const { svc, repo, runsRepo, engine, appended } = build();
    await svc.handle(ENTITLEMENT_CREATED_EVENT);

    expect(repo.listByTrigger).toHaveBeenCalledWith('org-1', 'entitlement.created');
    expect(runsRepo.insert).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        orgId: 'org-1',
        automationId: 'atm_1',
        trigger: 'entitlement.created',
        status: 'running',
        actionResults: [],
        startedAt: '2026-01-02T00:00:00Z',
        finishedAt: null,
        event: ENTITLEMENT_CREATED_EVENT,
      }),
    );
    expect(appended).toEqual([
      expect.objectContaining({ type: 'automation.run.started', orgId: 'org-1', run: RUN }),
    ]);
    expect(engine.dispatch).toHaveBeenCalledWith({
      runId: RUN.id,
      orgId: 'org-1',
      automationId: 'atm_1',
      actions: AUTOMATION.actions,
      event: ENTITLEMENT_CREATED_EVENT,
    });
  });

  it('skips a disabled automation even when its trigger matches', async () => {
    const { svc, runsRepo, engine } = build(
      fakeRepo({ listByTrigger: vi.fn().mockResolvedValue([DISABLED_AUTOMATION]) }),
    );
    await svc.handle(ENTITLEMENT_CREATED_EVENT);
    expect(runsRepo.insert).not.toHaveBeenCalled();
    expect(engine.dispatch).not.toHaveBeenCalled();
  });

  it('is a no-op for an event type with no matching automations', async () => {
    const { svc, repo, runsRepo, engine } = build(
      fakeRepo({ listByTrigger: vi.fn().mockResolvedValue([]) }),
    );
    await svc.handle({ ...ENTITLEMENT_CREATED_EVENT, type: 'progress.completed' });
    expect(repo.listByTrigger).toHaveBeenCalledWith('org-1', 'progress.completed');
    expect(runsRepo.insert).not.toHaveBeenCalled();
    expect(engine.dispatch).not.toHaveBeenCalled();
  });

  it('never throws — a dispatch failure is logged and the run is recorded failed', async () => {
    const engine = fakeEngine({ dispatch: vi.fn().mockRejectedValue(new Error('queue down')) });
    const runsRepo = fakeRunsRepo({
      recordOutcome: vi
        .fn()
        .mockResolvedValue({ ...RUN, status: 'failed', finishedAt: '2026-01-02T00:00:01Z' }),
    });
    const { svc, appended } = build(fakeRepo(), runsRepo, engine);

    await expect(svc.handle(ENTITLEMENT_CREATED_EVENT)).resolves.toBeUndefined();
    expect(runsRepo.recordOutcome).toHaveBeenCalledWith('org-1', 'run_1', {
      status: 'failed',
      actionResults: [],
      finishedAt: '2026-01-02T00:00:00Z',
    });
    expect(appended).toEqual([
      expect.objectContaining({ type: 'automation.run.started' }),
      expect.objectContaining({ type: 'automation.run.failed' }),
    ]);
  });

  it('never throws even when listByTrigger itself fails', async () => {
    const { svc, runsRepo, engine } = build(
      fakeRepo({ listByTrigger: vi.fn().mockRejectedValue(new Error('db down')) }),
    );
    await expect(svc.handle(ENTITLEMENT_CREATED_EVENT)).resolves.toBeUndefined();
    expect(runsRepo.insert).not.toHaveBeenCalled();
    expect(engine.dispatch).not.toHaveBeenCalled();
  });

  it('ignores an automation.run.started event even when a matching enabled automation exists', async () => {
    const selfTriggering: Automation = { ...AUTOMATION, id: 'atm_loop', trigger: 'automation.run.started' };
    const { svc, repo, runsRepo, engine } = build(
      fakeRepo({ listByTrigger: vi.fn().mockResolvedValue([selfTriggering]) }),
    );
    await svc.handle({
      type: 'automation.run.started',
      id: 'evt_loop',
      orgId: 'org-1',
      createdAt: '2026-01-01T00:00:00Z',
      run: RUN,
    } as DomainEvent);
    // The guard returns before even loading trigger matches.
    expect(repo.listByTrigger).not.toHaveBeenCalled();
    expect(runsRepo.insert).not.toHaveBeenCalled();
    expect(engine.dispatch).not.toHaveBeenCalled();
  });

  it('dedupes a redelivered trigger event: the second handle appends and dispatches nothing', async () => {
    const runsRepo = fakeRunsRepo({
      insert: vi.fn().mockResolvedValueOnce(RUN).mockResolvedValueOnce(null),
    });
    const { svc, engine, appended } = build(fakeRepo(), runsRepo, fakeEngine());

    await svc.handle(ENTITLEMENT_CREATED_EVENT);
    await svc.handle(ENTITLEMENT_CREATED_EVENT);

    expect(runsRepo.insert).toHaveBeenCalledTimes(2);
    expect(engine.dispatch).toHaveBeenCalledTimes(1);
    expect(appended).toEqual([
      expect.objectContaining({ type: 'automation.run.started', orgId: 'org-1', run: RUN }),
    ]);
  });
});

describe('AutomationsService.runAction', () => {
  const dispatch = (action: Automation['actions'][number], event: unknown): AutomationDispatch => ({
    runId: 'run_1',
    orgId: 'org-1',
    automationId: 'atm_1',
    actions: [action],
    event: event as AutomationDispatch['event'],
  });

  it('runs sendEmail and derives to/params from an entitlement.created event', async () => {
    const mailer = fakeMailer();
    const { svc } = build(fakeRepo(), fakeRunsRepo(), fakeEngine(), mailer);
    const result = await svc.runAction(
      dispatch({ type: 'sendEmail', template: 'accessGranted' }, ENTITLEMENT_CREATED_EVENT),
      0,
    );
    expect(result).toEqual({ index: 0, type: 'sendEmail', status: 'completed' });
    expect(mailer.send).toHaveBeenCalledWith('bob@example.com', 'accessGranted', {
      contentTitle: 'Intro',
      contentId: 'c1',
    });
  });

  it('derives accessRevoked (no contentId) from an entitlement.deleted event', async () => {
    const mailer = fakeMailer();
    const { svc } = build(fakeRepo(), fakeRunsRepo(), fakeEngine(), mailer);
    const result = await svc.runAction(
      dispatch({ type: 'sendEmail', template: 'accessRevoked' }, ENTITLEMENT_DELETED_EVENT),
      0,
    );
    expect(result.status).toBe('completed');
    expect(mailer.send).toHaveBeenCalledWith('bob@example.com', 'accessRevoked', {
      contentTitle: 'Intro',
    });
  });

  it('throws when the mailer fails — the engine owns retry', async () => {
    const mailer = fakeMailer({ send: vi.fn().mockRejectedValue(new Error('smtp down')) });
    const { svc } = build(fakeRepo(), fakeRunsRepo(), fakeEngine(), mailer);
    await expect(
      svc.runAction(dispatch({ type: 'sendEmail', template: 'accessGranted' }, ENTITLEMENT_CREATED_EVENT), 0),
    ).rejects.toThrow('smtp down');
  });

  it('throws a clear, named error for an underivable trigger/template pairing', async () => {
    const mailer = fakeMailer();
    const { svc } = build(fakeRepo(), fakeRunsRepo(), fakeEngine(), mailer);
    await expect(
      svc.runAction(dispatch({ type: 'sendEmail', template: 'courseCompleted' }, ENTITLEMENT_CREATED_EVENT), 0),
    ).rejects.toThrow(/courseCompleted/);
    expect(mailer.send).not.toHaveBeenCalled();
  });
});

describe('AutomationsService.finalize', () => {
  const dispatch: AutomationDispatch = {
    runId: 'run_1',
    orgId: 'org-1',
    automationId: 'atm_1',
    actions: [{ type: 'sendEmail', template: 'accessGranted' }],
    event: ENTITLEMENT_CREATED_EVENT,
  };

  it('records a completed run and appends automation.run.completed', async () => {
    const completedRun = { ...RUN, status: 'completed' as const, finishedAt: '2026-01-02T00:00:05Z' };
    const runsRepo = fakeRunsRepo({ recordOutcome: vi.fn().mockResolvedValue(completedRun) });
    const { svc, appended } = build(fakeRepo(), runsRepo);
    const results: AutomationActionResult[] = [{ index: 0, type: 'sendEmail', status: 'completed' }];

    await svc.finalize(dispatch, results);

    expect(runsRepo.recordOutcome).toHaveBeenCalledWith('org-1', 'run_1', {
      status: 'completed',
      actionResults: results,
      finishedAt: '2026-01-02T00:00:00Z',
    });
    expect(appended).toEqual([
      expect.objectContaining({ type: 'automation.run.completed', orgId: 'org-1', run: completedRun }),
    ]);
  });

  it('records a failed run and appends automation.run.failed + one automation.action.failed per failed result', async () => {
    const failedRun = { ...RUN, status: 'failed' as const, finishedAt: '2026-01-02T00:00:05Z' };
    const runsRepo = fakeRunsRepo({ recordOutcome: vi.fn().mockResolvedValue(failedRun) });
    const { svc, appended } = build(fakeRepo(), runsRepo);
    const results: AutomationActionResult[] = [
      { index: 0, type: 'sendEmail', status: 'failed', error: 'smtp down' },
    ];

    await svc.finalize(dispatch, results);

    expect(appended).toEqual([
      expect.objectContaining({ type: 'automation.run.failed', orgId: 'org-1', run: failedRun }),
      expect.objectContaining({
        type: 'automation.action.failed',
        orgId: 'org-1',
        runId: 'run_1',
        automationId: 'atm_1',
        result: results[0],
      }),
    ]);
  });

  it('treats a partial run (fewer results than actions) as failed', async () => {
    const runsRepo = fakeRunsRepo();
    const { svc } = build(fakeRepo(), runsRepo);
    await svc.finalize(
      { ...dispatch, actions: [{ type: 'sendEmail', template: 'accessGranted' }, { type: 'sendEmail', template: 'accessGranted' }] },
      [{ index: 0, type: 'sendEmail', status: 'completed' }],
    );
    expect(runsRepo.recordOutcome).toHaveBeenCalledWith(
      'org-1',
      'run_1',
      expect.objectContaining({ status: 'failed' }),
    );
  });
});

describe('AutomationsService CRUD', () => {
  it('creates an automation and appends automation.created', async () => {
    const { svc, repo, appended } = build();
    const input: CreateAutomationInput = {
      name: 'Welcome email',
      trigger: 'entitlement.created',
      actions: [{ type: 'sendEmail', template: 'accessGranted' }],
    };
    const created = await svc.create('org-1', input);
    expect(created).toEqual(AUTOMATION);
    expect(repo.insert).toHaveBeenCalledWith('org-1', input);
    expect(appended).toEqual([{ type: 'automation.created', orgId: 'org-1', automation: AUTOMATION }]);
  });

  it('rejects creating an automation whose trigger is in the automation.* namespace', async () => {
    const { svc, repo, append } = build();
    const input: CreateAutomationInput = {
      name: 'Loop',
      trigger: 'automation.run.started',
      actions: [{ type: 'sendEmail', template: 'accessGranted' }],
    };
    await expect(svc.create('org-1', input)).rejects.toThrow(InvalidTriggerError);
    expect(repo.insert).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('rejects updating an automation to a trigger in the automation.* namespace', async () => {
    const { svc, repo, append } = build();
    await expect(svc.update('org-1', 'atm_1', { trigger: 'automation.run.completed' })).rejects.toThrow(
      InvalidTriggerError,
    );
    expect(repo.update).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('updates an automation and appends automation.updated when more than enabled changes', async () => {
    const { svc, repo, appended } = build();
    const updated = await svc.update('org-1', 'atm_1', { name: 'New name' });
    expect(updated).toEqual(AUTOMATION);
    expect(repo.update).toHaveBeenCalledWith('org-1', 'atm_1', { name: 'New name' });
    expect(appended).toEqual([{ type: 'automation.updated', orgId: 'org-1', automation: AUTOMATION }]);
  });

  it('appends automation.enabled for an enabled:true-only update', async () => {
    const { svc, appended } = build();
    await svc.update('org-1', 'atm_1', { enabled: true });
    expect(appended).toEqual([{ type: 'automation.enabled', orgId: 'org-1', automationId: 'atm_1' }]);
  });

  it('appends automation.disabled for an enabled:false-only update', async () => {
    const { svc, appended } = build();
    await svc.update('org-1', 'atm_1', { enabled: false });
    expect(appended).toEqual([{ type: 'automation.disabled', orgId: 'org-1', automationId: 'atm_1' }]);
  });

  it('returns null and appends nothing when updating a missing automation', async () => {
    const { svc, append } = build(fakeRepo({ update: vi.fn().mockResolvedValue(null) }));
    const result = await svc.update('org-1', 'missing', { enabled: true });
    expect(result).toBeNull();
    expect(append).not.toHaveBeenCalled();
  });

  it('deletes an automation and appends automation.deleted with the removed snapshot', async () => {
    const { svc, repo, appended } = build();
    const ok = await svc.delete('org-1', 'atm_1');
    expect(ok).toBe(true);
    expect(repo.delete).toHaveBeenCalledWith('org-1', 'atm_1');
    expect(appended).toEqual([{ type: 'automation.deleted', orgId: 'org-1', automation: AUTOMATION }]);
  });

  it('returns false and appends nothing when deleting a missing automation', async () => {
    const { svc, append } = build(fakeRepo({ delete: vi.fn().mockResolvedValue(null) }));
    const ok = await svc.delete('org-1', 'missing');
    expect(ok).toBe(false);
    expect(append).not.toHaveBeenCalled();
  });

  it('lists and gets automations via the read repository, without a uow', async () => {
    const { svc, repo, append } = build();
    expect(await svc.list('org-1')).toEqual([AUTOMATION]);
    expect(repo.listByOrg).toHaveBeenCalledWith('org-1');
    expect(await svc.get('org-1', 'atm_1')).toEqual(AUTOMATION);
    expect(repo.findById).toHaveBeenCalledWith('org-1', 'atm_1');
    expect(append).not.toHaveBeenCalled();
  });

  it('lists runs via the runs read repository', async () => {
    const { svc, runsRepo } = build();
    const page = await svc.listRuns('org-1', 'atm_1', { page: 1, pageSize: 20 });
    expect(page.rows).toEqual([RUN]);
    expect(runsRepo.list).toHaveBeenCalledWith('org-1', 'atm_1', { page: 1, pageSize: 20 });
  });
});

describe('AutomationsService.availableActions', () => {
  it("composes the catalog with every loaded integration's actions", () => {
    const integrations = fakeIntegrations({
      available: vi.fn().mockReturnValue([
        {
          id: 'slack',
          configSchema: { type: 'object' },
          secretsSchema: { type: 'object' },
          actions: [
            {
              id: 'postMessageToChannel',
              description: 'Post a message to a channel.',
              inputSchema: { type: 'object' },
              outputSchema: { type: 'object' },
            },
          ],
        },
      ]),
    });
    const { svc } = build(fakeRepo(), fakeRunsRepo(), fakeEngine(), fakeMailer(), integrations);

    const available = svc.availableActions();

    expect(available.actions).toEqual([
      expect.objectContaining({
        type: 'sendEmail',
        validTemplatesByTrigger: {
          'entitlement.created': ['accessGranted'],
          'entitlement.deleted': ['accessRevoked'],
        },
      }),
    ]);
    expect(available.integrations).toEqual([
      {
        id: 'slack',
        actions: [
          {
            id: 'postMessageToChannel',
            description: 'Post a message to a channel.',
            inputSchema: { type: 'object' },
            outputSchema: { type: 'object' },
          },
        ],
      },
    ]);
  });
});

describe('AutomationsService.availableTriggers', () => {
  it('lists domain event types with descriptions, entitlement.created included', () => {
    const { svc } = build();
    const { triggers } = svc.availableTriggers();
    expect(triggers.length).toBeGreaterThan(0);
    for (const trigger of triggers) {
      expect(trigger.type).toBeTruthy();
      expect(trigger.description).toBeTruthy();
    }
    expect(triggers).toContainEqual({
      type: 'entitlement.created',
      description: 'a student was granted access to content',
    });
  });

  it('excludes the automation.* family', () => {
    const { svc } = build();
    const { triggers } = svc.availableTriggers();
    expect(triggers.filter((t) => t.type.startsWith('automation.'))).toEqual([]);
  });
});
