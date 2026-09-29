import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { AutomationsServiceImpl } from './service.js';
import { createHmac } from 'node:crypto';
import {
  AutomationKindMismatchError,
  InvalidTriggerError,
  ReservedActionError,
  type Automation,
  type AutomationActionResult,
  type AutomationRun,
} from './model.js';
import type { CreateAutomationInput } from './types.js';
import type {
  AutomationDispatch,
  AutomationEngine,
  AutomationRunsRepository,
  AutomationsRepository,
  AutomationsUnitOfWork,
  WebhookSender,
} from './ports.js';
import type {
  CredentialStore,
  DomainEvent,
  NewDomainEvent,
  OutboxAppender,
} from '../shared/ports.js';
import { NotFoundError } from '../shared/errors.js';
import type { Entitlement } from '../entitlements/index.js';
import type { IntegrationsService } from '../integrations/index.js';
import type { Mailer, MailerLookups } from '../shared/mailer.js';
import { automationEvents } from './events.js';

const SAMPLE_ENTITLEMENT: Entitlement = {
  orgId: 'org-1',
  id: 'e1',
  orgUserId: 's1',
  bundleId: null,
  contentId: 'c1',
  status: 'active',
  grantedAt: new Date('2026-01-01T00:00:00Z'),
  expiresAt: null,
  source: 'manual',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

// Trigger events reach the automations service through the outbox relay, so
// their payloads are plain JSON — dates are ISO strings, not Date instances.
const RELAYED_ENTITLEMENT = {
  ...SAMPLE_ENTITLEMENT,
  grantedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const ENTITLEMENT_CREATED_EVENT = {
  type: 'entitlement.created',
  version: 1,
  id: 'evt_1',
  orgId: 'org-1',
  occurredAt: '2026-01-01T00:00:00Z',
  data: RELAYED_ENTITLEMENT,
} as unknown as DomainEvent;

const ENTITLEMENT_DELETED_EVENT = {
  type: 'entitlement.deleted',
  version: 1,
  id: 'evt_2',
  orgId: 'org-1',
  occurredAt: '2026-01-01T00:00:00Z',
  data: RELAYED_ENTITLEMENT,
} as unknown as DomainEvent;

const AUTOMATION: Automation = {
  orgId: 'org-1',
  id: 'atm_1',
  name: 'Welcome email',
  kind: 'workflow',
  description: 'Send a welcome email on access grant',
  triggers: ['entitlement.created'],
  actions: [{ type: 'sendEmail', input: { template: 'accessGranted' } }],
  enabled: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const DISABLED_AUTOMATION: Automation = { ...AUTOMATION, id: 'atm_2', enabled: false };

const WEBHOOK_SECRET = `whsec_${Buffer.from('k'.repeat(32)).toString('base64')}`;

const WEBHOOK_AUTOMATION: Automation = {
  orgId: 'org-1',
  id: 'atm_wh',
  name: 'https://crm.example.com/hooks',
  kind: 'webhook',
  description: 'CRM sync',
  triggers: ['entitlement.created', 'entitlement.deleted'],
  actions: [
    {
      type: 'deliverWebhook',
      input: { url: 'https://crm.example.com/hooks', secretRef: 'crd_1' },
    },
  ],
  enabled: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const RUN: AutomationRun = {
  id: 'run_1',
  orgId: 'org-1',
  automationId: 'atm_1',
  trigger: 'entitlement.created',
  eventId: 'evt_1',
  event: ENTITLEMENT_CREATED_EVENT,
  rerunOf: null,
  status: 'running',
  actionResults: [],
  startedAt: new Date('2026-01-02T00:00:00Z'),
  finishedAt: null,
  createdAt: new Date('2026-01-02T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
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
    findById: vi.fn().mockResolvedValue(RUN),
    recordOutcome: vi.fn().mockResolvedValue({
      ...RUN,
      status: 'completed',
      finishedAt: new Date('2026-01-02T00:00:05Z'),
    }),
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

function fakeCredentials(over?: Partial<CredentialStore>): CredentialStore {
  return {
    store: vi.fn().mockResolvedValue('crd_1'),
    reveal: vi.fn().mockResolvedValue({ secret: WEBHOOK_SECRET }),
    update: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

function fakeWebhooks(status = 200): WebhookSender {
  return { send: vi.fn().mockResolvedValue({ status }) };
}

/** Pass-through unit of work: runs the callback with the fake repos as the
 *  tx-bound scope plus a capturing outbox appender. */
function fakeUow(
  repo: AutomationsRepository,
  runsRepo: AutomationRunsRepository,
  credentials: CredentialStore,
) {
  const appended: NewDomainEvent[] = [];
  const append = vi.fn(async (events: NewDomainEvent[]) => {
    appended.push(...events);
  });
  const outbox: OutboxAppender = { append };
  const uow: AutomationsUnitOfWork = {
    run: (fn) => fn({ automations: repo, runs: runsRepo, credentials, outbox }),
  };
  return { uow, append, appended };
}

function fakeLookups(over?: Partial<MailerLookups>): MailerLookups {
  return {
    orgUserEmail: vi.fn().mockResolvedValue('bob@example.com'),
    contentInfo: vi.fn().mockResolvedValue({ id: 'c1', title: 'Intro', type: 'course' }),
    ...over,
  };
}

function build(
  repo = fakeRepo(),
  runsRepo = fakeRunsRepo(),
  engine = fakeEngine(),
  mailer = fakeMailer(),
  integrations = fakeIntegrations(),
  lookups = fakeLookups(),
  credentials = fakeCredentials(),
  webhooks = fakeWebhooks(),
) {
  const { uow, append, appended } = fakeUow(repo, runsRepo, credentials);
  const svc = new AutomationsServiceImpl({
    repo,
    runsRepo,
    uow,
    engine,
    mailer,
    lookups,
    integrations,
    credentials,
    webhooks,
  });
  return {
    svc,
    repo,
    runsRepo,
    engine,
    mailer,
    integrations,
    credentials,
    webhooks,
    append,
    appended,
  };
}

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));
});
afterAll(() => {
  vi.useRealTimers();
});

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
        startedAt: new Date('2026-01-02T00:00:00.000Z'),
        finishedAt: null,
        event: ENTITLEMENT_CREATED_EVENT,
      }),
    );
    expect(appended).toEqual([
      expect.objectContaining({
        type: 'automation.run.started',
        orgId: 'org-1',
        data: RUN,
      }),
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
    await svc.handle({ ...ENTITLEMENT_CREATED_EVENT, type: 'progress.record.completed' });
    expect(repo.listByTrigger).toHaveBeenCalledWith('org-1', 'progress.record.completed');
    expect(runsRepo.insert).not.toHaveBeenCalled();
    expect(engine.dispatch).not.toHaveBeenCalled();
  });

  it('never throws — a dispatch failure is logged and the run is recorded failed', async () => {
    const engine = fakeEngine({ dispatch: vi.fn().mockRejectedValue(new Error('queue down')) });
    const runsRepo = fakeRunsRepo({
      recordOutcome: vi.fn().mockResolvedValue({
        ...RUN,
        status: 'failed',
        finishedAt: new Date('2026-01-02T00:00:01Z'),
      }),
    });
    const { svc, appended } = build(fakeRepo(), runsRepo, engine);

    await expect(svc.handle(ENTITLEMENT_CREATED_EVENT)).resolves.toBeUndefined();
    expect(runsRepo.recordOutcome).toHaveBeenCalledWith('org-1', 'run_1', {
      status: 'failed',
      actionResults: [],
      finishedAt: new Date('2026-01-02T00:00:00.000Z'),
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
    const selfTriggering: Automation = {
      ...AUTOMATION,
      id: 'atm_loop',
      triggers: ['automation.run.started'],
    };
    const { svc, repo, runsRepo, engine } = build(
      fakeRepo({ listByTrigger: vi.fn().mockResolvedValue([selfTriggering]) }),
    );
    await svc.handle({
      type: automationEvents.runStarted.type,
      version: 1,
      id: 'evt_loop',
      orgId: 'org-1',
      occurredAt: '2026-01-01T00:00:00Z',
      data: RUN,
    });
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
      expect.objectContaining({
        type: 'automation.run.started',
        orgId: 'org-1',
        data: RUN,
      }),
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
      dispatch(
        { type: 'sendEmail', input: { template: 'accessGranted' } },
        ENTITLEMENT_CREATED_EVENT,
      ),
      0,
    );
    expect(result).toEqual({ index: 0, type: 'sendEmail', status: 'completed' });
    expect(mailer.send).toHaveBeenCalledWith('bob@example.com', 'accessGranted', {
      contentTitle: 'Intro',
      contentId: 'c1',
      contentType: 'course',
    });
  });

  it('derives accessRevoked (no contentId) from an entitlement.deleted event', async () => {
    const mailer = fakeMailer();
    const { svc } = build(fakeRepo(), fakeRunsRepo(), fakeEngine(), mailer);
    const result = await svc.runAction(
      dispatch(
        { type: 'sendEmail', input: { template: 'accessRevoked' } },
        ENTITLEMENT_DELETED_EVENT,
      ),
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
      svc.runAction(
        dispatch(
          { type: 'sendEmail', input: { template: 'accessGranted' } },
          ENTITLEMENT_CREATED_EVENT,
        ),
        0,
      ),
    ).rejects.toThrow('smtp down');
  });

  it('throws a clear, named error for an underivable trigger/template pairing', async () => {
    const mailer = fakeMailer();
    const { svc } = build(fakeRepo(), fakeRunsRepo(), fakeEngine(), mailer);
    await expect(
      svc.runAction(
        dispatch(
          { type: 'sendEmail', input: { template: 'courseCompleted' } },
          ENTITLEMENT_CREATED_EVENT,
        ),
        0,
      ),
    ).rejects.toThrow(/courseCompleted/);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('throws an error naming an unknown template', async () => {
    const mailer = fakeMailer();
    const { svc } = build(fakeRepo(), fakeRunsRepo(), fakeEngine(), mailer);
    await expect(
      svc.runAction(
        dispatch({ type: 'sendEmail', input: { template: 'nope' } }, ENTITLEMENT_CREATED_EVENT),
        0,
      ),
    ).rejects.toThrow(/nope/);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('throws for an unknown action type', async () => {
    const mailer = fakeMailer();
    const { svc } = build(fakeRepo(), fakeRunsRepo(), fakeEngine(), mailer);
    await expect(
      svc.runAction(dispatch({ type: 'not-an-action', input: {} }, ENTITLEMENT_CREATED_EVENT), 0),
    ).rejects.toThrow(/not-an-action/);
    expect(mailer.send).not.toHaveBeenCalled();
  });
});

describe('AutomationsService.finalize', () => {
  const dispatch: AutomationDispatch = {
    runId: 'run_1',
    orgId: 'org-1',
    automationId: 'atm_1',
    actions: [{ type: 'sendEmail', input: { template: 'accessGranted' } }],
    event: ENTITLEMENT_CREATED_EVENT,
  };

  it('records a completed run and appends automation.run.completed', async () => {
    const completedRun = {
      ...RUN,
      status: 'completed' as const,
      finishedAt: new Date('2026-01-02T00:00:05Z'),
    };
    const runsRepo = fakeRunsRepo({ recordOutcome: vi.fn().mockResolvedValue(completedRun) });
    const { svc, appended } = build(fakeRepo(), runsRepo);
    const results: AutomationActionResult[] = [
      { index: 0, type: 'sendEmail', status: 'completed' },
    ];

    await svc.finalize(dispatch, results);

    expect(runsRepo.recordOutcome).toHaveBeenCalledWith('org-1', 'run_1', {
      status: 'completed',
      actionResults: results,
      finishedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    expect(appended).toEqual([
      expect.objectContaining({
        type: 'automation.run.completed',
        orgId: 'org-1',
        data: completedRun,
      }),
    ]);
  });

  it('records a failed run and appends automation.run.failed + one automation.action.failed per failed result', async () => {
    const failedRun = {
      ...RUN,
      status: 'failed' as const,
      finishedAt: new Date('2026-01-02T00:00:05Z'),
    };
    const runsRepo = fakeRunsRepo({ recordOutcome: vi.fn().mockResolvedValue(failedRun) });
    const { svc, appended } = build(fakeRepo(), runsRepo);
    const results: AutomationActionResult[] = [
      { index: 0, type: 'sendEmail', status: 'failed', error: 'smtp down' },
    ];

    await svc.finalize(dispatch, results);

    expect(appended).toEqual([
      expect.objectContaining({
        type: 'automation.run.failed',
        orgId: 'org-1',
        data: failedRun,
      }),
      expect.objectContaining({
        type: 'automation.action.failed',
        orgId: 'org-1',
        data: results[0],
      }),
    ]);
  });

  it('treats a partial run (fewer results than actions) as failed', async () => {
    const runsRepo = fakeRunsRepo();
    const { svc } = build(fakeRepo(), runsRepo);
    await svc.finalize(
      {
        ...dispatch,
        actions: [
          { type: 'sendEmail', input: { template: 'accessGranted' } },
          { type: 'sendEmail', input: { template: 'accessGranted' } },
        ],
      },
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
      triggers: ['entitlement.created'],
      actions: [{ type: 'sendEmail', input: { template: 'accessGranted' } }],
    };
    const created = await svc.create('org-1', input);
    expect(created).toEqual(AUTOMATION);
    expect(repo.insert).toHaveBeenCalledWith('org-1', { ...input, kind: 'workflow' });
    expect(appended).toEqual([
      expect.objectContaining({
        type: 'automation.created',
        orgId: 'org-1',
        data: AUTOMATION,
      }),
    ]);
  });

  it('rejects creating an automation whose trigger is in the automation.* namespace', async () => {
    const { svc, repo, append } = build();
    const input: CreateAutomationInput = {
      name: 'Loop',
      triggers: ['entitlement.created', 'automation.run.started'],
      actions: [{ type: 'sendEmail', input: { template: 'accessGranted' } }],
    };
    await expect(svc.create('org-1', input)).rejects.toThrow(InvalidTriggerError);
    expect(repo.insert).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('rejects updating an automation to a trigger in the automation.* namespace', async () => {
    const { svc, repo, append } = build();
    await expect(
      svc.update('org-1', 'atm_1', { triggers: ['automation.run.completed'] }),
    ).rejects.toThrow(InvalidTriggerError);
    expect(repo.update).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('updates an automation and appends automation.updated when more than enabled changes', async () => {
    const { svc, repo, appended } = build();
    const updated = await svc.update('org-1', 'atm_1', { name: 'New name' });
    expect(updated).toEqual(AUTOMATION);
    expect(repo.update).toHaveBeenCalledWith('org-1', 'atm_1', { name: 'New name' });
    expect(appended).toEqual([
      expect.objectContaining({
        type: 'automation.updated',
        orgId: 'org-1',
        data: AUTOMATION,
      }),
    ]);
  });

  it('appends automation.enabled for an enabled:true-only update', async () => {
    const { svc, appended } = build();
    await svc.update('org-1', 'atm_1', { enabled: true });
    expect(appended).toEqual([
      expect.objectContaining({
        type: 'automation.enabled',
        orgId: 'org-1',
        data: AUTOMATION,
      }),
    ]);
  });

  it('appends automation.disabled for an enabled:false-only update', async () => {
    const { svc, appended } = build();
    await svc.update('org-1', 'atm_1', { enabled: false });
    expect(appended).toEqual([
      expect.objectContaining({
        type: 'automation.disabled',
        orgId: 'org-1',
        data: AUTOMATION,
      }),
    ]);
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
    expect(appended).toEqual([
      expect.objectContaining({
        type: 'automation.deleted',
        orgId: 'org-1',
        data: AUTOMATION,
      }),
    ]);
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
    expect(repo.listByOrg).toHaveBeenCalledWith('org-1', undefined);
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
  it("returns a flat list: built-ins first, then each loaded integration's actions namespaced by id", () => {
    const integrations = fakeIntegrations({
      available: vi.fn().mockReturnValue([
        {
          id: 'slack',
          configSchema: { type: 'object' },
          secretsSchema: { type: 'object' },
          actions: [
            {
              id: 'send-message',
              description: 'Post a message to a channel.',
              inputSchema: { type: 'object', required: ['channel'] },
              outputSchema: { type: 'object' },
            },
          ],
        },
      ]),
    });
    const { svc } = build(fakeRepo(), fakeRunsRepo(), fakeEngine(), fakeMailer(), integrations);

    expect(svc.availableActions()).toEqual([
      {
        type: 'sendEmail',
        description: expect.any(String),
        inputSchema: expect.objectContaining({ type: 'object', required: ['template'] }),
        source: 'system',
      },
      {
        type: 'slack.send-message',
        description: 'Post a message to a channel.',
        inputSchema: { type: 'object', required: ['channel'] },
        source: 'slack',
      },
    ]);
  });

  it('returns only the built-ins when no integrations are loaded', () => {
    const { svc } = build();
    expect(svc.availableActions().map((a) => a.type)).toEqual(['sendEmail']);
  });
});

describe('AutomationsService.availableTriggers', () => {
  it('lists domain event types with descriptions, entitlement.created included', () => {
    const { svc } = build();
    const { triggers } = svc.availableTriggers();
    expect(triggers.length).toBeGreaterThan(0);
    for (const trigger of triggers) {
      expect(trigger.type).toBeTruthy();
      expect(trigger.label).toBeTruthy();
      expect(trigger.category).toBeTruthy();
      expect(trigger.description).toBeTruthy();
    }
    expect(triggers).toContainEqual({
      type: 'entitlement.created',
      label: 'Access granted',
      category: 'Access',
      description: 'a student was granted access to content',
    });
  });

  it('excludes the automation.* family', () => {
    const { svc } = build();
    const { triggers } = svc.availableTriggers();
    expect(triggers.filter((t) => t.type.startsWith('automation.'))).toEqual([]);
  });
});

describe('AutomationsService workflow guards', () => {
  it('rejects authoring the reserved deliverWebhook action', async () => {
    const { svc, repo } = build();
    const actions = [
      { type: 'deliverWebhook', input: { url: 'https://x.test', secretRef: 'crd_x' } },
    ];
    await expect(
      svc.create('org-1', { name: 'Sneaky', triggers: ['entitlement.created'], actions }),
    ).rejects.toThrow(ReservedActionError);
    await expect(svc.update('org-1', 'atm_1', { actions })).rejects.toThrow(ReservedActionError);
    expect(repo.insert).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('refuses to update or delete a webhook through the workflow operations', async () => {
    const { svc, repo, append } = build(
      fakeRepo({ findById: vi.fn().mockResolvedValue(WEBHOOK_AUTOMATION) }),
    );
    await expect(svc.update('org-1', 'atm_wh', { name: 'x' })).rejects.toThrow(
      AutomationKindMismatchError,
    );
    await expect(svc.delete('org-1', 'atm_wh')).rejects.toThrow(AutomationKindMismatchError);
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('dedupes triggers on create', async () => {
    const { svc, repo } = build();
    await svc.create('org-1', {
      name: 'Twice',
      triggers: ['entitlement.created', 'entitlement.created'],
      actions: [],
    });
    expect(repo.insert).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ triggers: ['entitlement.created'] }),
    );
  });

  it('filters the list by kind', async () => {
    const { svc, repo } = build();
    await svc.list('org-1', { kind: 'workflow' });
    expect(repo.listByOrg).toHaveBeenCalledWith('org-1', 'workflow');
  });
});

describe('AutomationsService.rerun', () => {
  const FAILED_RUN: AutomationRun = { ...RUN, id: 'run_0', status: 'failed' };

  it("opens a new run against the previous run's event and dispatches it", async () => {
    const runsRepo = fakeRunsRepo({ findById: vi.fn().mockResolvedValue(FAILED_RUN) });
    const { svc, engine, appended } = build(fakeRepo(), runsRepo);

    const run = await svc.rerun('org-1', 'atm_1', 'run_0');

    expect(run).toEqual(RUN);
    expect(runsRepo.insert).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        automationId: 'atm_1',
        trigger: 'entitlement.created',
        event: ENTITLEMENT_CREATED_EVENT,
        rerunOf: 'run_0',
        status: 'running',
      }),
    );
    expect(appended).toEqual([expect.objectContaining({ type: 'automation.run.started' })]);
    expect(engine.dispatch).toHaveBeenCalledWith({
      runId: RUN.id,
      orgId: 'org-1',
      automationId: 'atm_1',
      actions: AUTOMATION.actions,
      event: ENTITLEMENT_CREATED_EVENT,
    });
  });

  it('throws NotFoundError when the run belongs to another automation', async () => {
    const runsRepo = fakeRunsRepo({
      findById: vi.fn().mockResolvedValue({ ...FAILED_RUN, automationId: 'atm_other' }),
    });
    const { svc, engine } = build(fakeRepo(), runsRepo);
    await expect(svc.rerun('org-1', 'atm_1', 'run_0')).rejects.toThrow(NotFoundError);
    expect(engine.dispatch).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the automation no longer exists', async () => {
    const runsRepo = fakeRunsRepo({ findById: vi.fn().mockResolvedValue(FAILED_RUN) });
    const { svc, engine } = build(
      fakeRepo({ findById: vi.fn().mockResolvedValue(null) }),
      runsRepo,
    );
    await expect(svc.rerun('org-1', 'atm_1', 'run_0')).rejects.toThrow(NotFoundError);
    expect(runsRepo.insert).not.toHaveBeenCalled();
    expect(engine.dispatch).not.toHaveBeenCalled();
  });

  it('records the new run as failed when dispatch fails', async () => {
    const failed = { ...RUN, status: 'failed' as const };
    const runsRepo = fakeRunsRepo({
      findById: vi.fn().mockResolvedValue(FAILED_RUN),
      recordOutcome: vi.fn().mockResolvedValue(failed),
    });
    const engine = fakeEngine({ dispatch: vi.fn().mockRejectedValue(new Error('queue down')) });
    const { svc } = build(fakeRepo(), runsRepo, engine);
    await expect(svc.rerun('org-1', 'atm_1', 'run_0')).resolves.toEqual(failed);
  });
});

describe('AutomationsService webhooks', () => {
  const webhookRepo = (over?: Partial<AutomationsRepository>) =>
    fakeRepo({
      insert: vi.fn().mockResolvedValue(WEBHOOK_AUTOMATION),
      update: vi.fn().mockResolvedValue(WEBHOOK_AUTOMATION),
      delete: vi.fn().mockResolvedValue(WEBHOOK_AUTOMATION),
      findById: vi.fn().mockResolvedValue(WEBHOOK_AUTOMATION),
      listByOrg: vi.fn().mockResolvedValue([WEBHOOK_AUTOMATION]),
      ...over,
    });

  const WEBHOOK = {
    orgId: 'org-1',
    id: 'atm_wh',
    url: 'https://crm.example.com/hooks',
    events: ['entitlement.created', 'entitlement.deleted'],
    description: 'CRM sync',
    enabled: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  const buildWebhooks = (credentials = fakeCredentials(), repo = webhookRepo()) =>
    build(
      repo,
      fakeRunsRepo(),
      fakeEngine(),
      fakeMailer(),
      fakeIntegrations(),
      fakeLookups(),
      credentials,
    );

  it('creates a webhook automation with a stored signing secret and returns the secret once', async () => {
    const { svc, repo, credentials, appended } = buildWebhooks();

    const created = await svc.createWebhook('org-1', {
      url: 'https://crm.example.com/hooks',
      events: ['entitlement.created', 'entitlement.deleted', 'entitlement.created'],
      description: 'CRM sync',
    });

    const [, stored] = vi.mocked(credentials.store).mock.calls[0]!;
    expect(stored).toEqual({ secret: expect.stringMatching(/^whsec_/) });
    expect(repo.insert).toHaveBeenCalledWith('org-1', {
      kind: 'webhook',
      name: 'https://crm.example.com/hooks',
      description: 'CRM sync',
      triggers: ['entitlement.created', 'entitlement.deleted'],
      actions: [
        {
          type: 'deliverWebhook',
          input: { url: 'https://crm.example.com/hooks', secretRef: 'crd_1' },
        },
      ],
    });
    expect(created).toEqual({ ...WEBHOOK, secret: stored['secret'] });
    expect(appended).toEqual([
      expect.objectContaining({ type: 'automation.created', data: WEBHOOK_AUTOMATION }),
    ]);
  });

  it('rejects events the system does not emit, and the automation.* family', async () => {
    const { svc, repo } = buildWebhooks();
    await expect(
      svc.createWebhook('org-1', { url: 'https://x.test', events: ['nope.happened'] }),
    ).rejects.toThrow(InvalidTriggerError);
    await expect(
      svc.createWebhook('org-1', { url: 'https://x.test', events: ['automation.run.failed'] }),
    ).rejects.toThrow(InvalidTriggerError);
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('lists and gets webhooks as their own shape', async () => {
    const { svc, repo } = buildWebhooks();
    expect(await svc.listWebhooks('org-1')).toEqual([WEBHOOK]);
    expect(repo.listByOrg).toHaveBeenCalledWith('org-1', 'webhook');
    expect(await svc.getWebhook('org-1', 'atm_wh')).toEqual(WEBHOOK);
  });

  it('does not treat a workflow as a webhook', async () => {
    const { svc, repo, credentials } = build();
    expect(await svc.getWebhook('org-1', 'atm_1')).toBeNull();
    expect(await svc.updateWebhook('org-1', 'atm_1', { enabled: false })).toBeNull();
    expect(await svc.deleteWebhook('org-1', 'atm_1')).toBe(false);
    expect(await svc.revealWebhookSecret('org-1', 'atm_1')).toBeNull();
    expect(await svc.rotateWebhookSecret('org-1', 'atm_1')).toBeNull();
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
    expect(credentials.update).not.toHaveBeenCalled();
  });

  it('rewrites the delivery target on a URL change, keeping the signing secret', async () => {
    const { svc, repo, appended } = buildWebhooks();
    await svc.updateWebhook('org-1', 'atm_wh', {
      url: 'https://new.example.com/hooks',
      events: ['progress.record.completed'],
    });
    expect(repo.update).toHaveBeenCalledWith('org-1', 'atm_wh', {
      name: 'https://new.example.com/hooks',
      description: undefined,
      triggers: ['progress.record.completed'],
      actions: [
        {
          type: 'deliverWebhook',
          input: { url: 'https://new.example.com/hooks', secretRef: 'crd_1' },
        },
      ],
      enabled: undefined,
    });
    expect(appended).toEqual([expect.objectContaining({ type: 'automation.updated' })]);
  });

  it('appends automation.disabled for an enabled:false-only webhook update', async () => {
    const { svc, appended } = buildWebhooks();
    await svc.updateWebhook('org-1', 'atm_wh', { enabled: false });
    expect(appended).toEqual([expect.objectContaining({ type: 'automation.disabled' })]);
  });

  it('deletes the webhook and destroys its signing secret', async () => {
    const { svc, credentials, appended } = buildWebhooks();
    expect(await svc.deleteWebhook('org-1', 'atm_wh')).toBe(true);
    expect(credentials.destroy).toHaveBeenCalledWith('org-1', 'crd_1');
    expect(appended).toEqual([expect.objectContaining({ type: 'automation.deleted' })]);
  });

  it('reveals and rotates the signing secret', async () => {
    const { svc, credentials } = buildWebhooks();
    expect(await svc.revealWebhookSecret('org-1', 'atm_wh')).toEqual({ secret: WEBHOOK_SECRET });
    const rotated = await svc.rotateWebhookSecret('org-1', 'atm_wh');
    expect(rotated?.secret).toMatch(/^whsec_/);
    expect(rotated?.secret).not.toBe(WEBHOOK_SECRET);
    expect(credentials.update).toHaveBeenCalledWith('org-1', 'crd_1', {
      secret: rotated?.secret,
    });
  });
});

describe('AutomationsService.runAction deliverWebhook', () => {
  const dispatch: AutomationDispatch = {
    runId: 'run_1',
    orgId: 'org-1',
    automationId: 'atm_wh',
    actions: WEBHOOK_AUTOMATION.actions,
    event: ENTITLEMENT_CREATED_EVENT,
  };

  const buildWith = (webhooks: WebhookSender, credentials = fakeCredentials()) =>
    build(
      fakeRepo(),
      fakeRunsRepo(),
      fakeEngine(),
      fakeMailer(),
      fakeIntegrations(),
      fakeLookups(),
      credentials,
      webhooks,
    );

  it('POSTs the event, signed per Standard Webhooks', async () => {
    const webhooks = fakeWebhooks(204);
    const { svc } = buildWith(webhooks);

    const result = await svc.runAction(dispatch, 0);

    expect(result).toEqual({ index: 0, type: 'deliverWebhook', status: 'completed' });
    const [request] = vi.mocked(webhooks.send).mock.calls[0]!;
    const body = JSON.stringify(ENTITLEMENT_CREATED_EVENT);
    const timestamp = String(Math.floor(new Date('2026-01-02T00:00:00Z').getTime() / 1000));
    const key = Buffer.from(WEBHOOK_SECRET.slice('whsec_'.length), 'base64');
    const expected = createHmac('sha256', key)
      .update(`evt_1.${timestamp}.${body}`)
      .digest('base64');
    expect(request).toEqual({
      url: 'https://crm.example.com/hooks',
      body,
      headers: {
        'content-type': 'application/json',
        'webhook-id': 'evt_1',
        'webhook-timestamp': timestamp,
        'webhook-signature': `v1,${expected}`,
      },
    });
  });

  it('throws on a non-2xx response so the engine retries', async () => {
    const { svc } = buildWith(fakeWebhooks(500));
    await expect(svc.runAction(dispatch, 0)).rejects.toThrow(/responded 500/);
  });

  it('throws when the signing secret is gone', async () => {
    const { svc } = buildWith(
      fakeWebhooks(),
      fakeCredentials({ reveal: vi.fn().mockResolvedValue(null) }),
    );
    await expect(svc.runAction(dispatch, 0)).rejects.toThrow(/signing secret not found/);
  });
});
