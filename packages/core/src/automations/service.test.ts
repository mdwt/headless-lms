import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { AutomationsServiceImpl } from './service.js';
import { createHmac } from 'node:crypto';
import {
  ActionFailedError,
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
  NewAutomation,
  WebhookSender,
} from './ports.js';
import type {
  CredentialStore,
  DomainEvent,
  Logger,
  NewDomainEvent,
  OutboxAppender,
} from '../shared/ports.js';
import { createCapturingLogger, noopLogger } from '../shared/logger.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import type { Entitlement } from '../entitlements/index.js';
import type { IntegrationsService } from '../integrations/index.js';
import type { Mailer, MailerLookups } from '../shared/mailer.js';
import { automationEvents } from './events.js';
import {
  emptyCommunityMail,
  emptyNotificationDesk,
  emptyScheduledWork,
  type ScheduledWork,
} from './community-mail.js';

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
  filter: null,
  source: 'user',
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
  filter: null,
  source: 'user',
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
    insertSeed: vi.fn().mockResolvedValue(AUTOMATION),
    update: vi.fn().mockResolvedValue(AUTOMATION),
    delete: vi.fn().mockResolvedValue(AUTOMATION),
    findById: vi.fn().mockResolvedValue(AUTOMATION),
    listByOrg: vi.fn().mockResolvedValue([AUTOMATION]),
    listByTrigger: vi.fn().mockResolvedValue([AUTOMATION]),
    listSchedules: vi.fn().mockResolvedValue([]),
    ...over,
  };
}

function fakeRunsRepo(over?: Partial<AutomationRunsRepository>): AutomationRunsRepository {
  return {
    insert: vi.fn().mockResolvedValue(RUN),
    findById: vi.fn().mockResolvedValue(RUN),
    restart: vi.fn().mockResolvedValue(RUN),
    recordOutcome: vi.fn().mockResolvedValue({
      ...RUN,
      status: 'completed',
      finishedAt: new Date('2026-01-02T00:00:05Z'),
    }),
    list: vi.fn().mockResolvedValue({ rows: [RUN], total: 1, page: 1, pageSize: 20 }),
    recentRecipients: vi.fn().mockResolvedValue([]),
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
    orgUserPerson: vi.fn().mockResolvedValue({ userId: 'usr_bob', email: 'bob@example.com' }),
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
  scheduledWork: ScheduledWork = emptyScheduledWork,
  logger: Logger = noopLogger,
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
    mail: emptyCommunityMail,
    grants: {
      grant: async () => {
        throw new Error('grantAccess: no grant writer configured');
      },
    },
    desk: emptyNotificationDesk,
    scheduledWork,
    logger,
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
  it('skips an automation whose filter is not in the event', async () => {
    const repo = fakeRepo({
      listByTrigger: vi
        .fn()
        .mockResolvedValue([{ ...AUTOMATION, filter: { communityId: 'cmy_1' } }]),
    });
    const { svc, engine } = build(repo);
    await svc.handle(ENTITLEMENT_CREATED_EVENT);
    expect(engine.dispatch).not.toHaveBeenCalled();
  });

  it('dispatches when every filter field equals the event data', async () => {
    const repo = fakeRepo({
      listByTrigger: vi.fn().mockResolvedValue([{ ...AUTOMATION, filter: { contentId: 'c1' } }]),
    });
    const { svc, engine } = build(repo);
    await svc.handle(ENTITLEMENT_CREATED_EVENT);
    expect(engine.dispatch).toHaveBeenCalledTimes(1);
  });

  it('seeds the org automations once when the organization is created', async () => {
    const stored: Automation[] = [];
    const repo = fakeRepo({
      listByTrigger: vi.fn().mockResolvedValue([]),
      insertSeed: vi.fn(async (_orgId: string, input: NewAutomation) => {
        const key = `${input.name}:${String(input.filter?.['communityId'] ?? '')}`;
        if (
          stored.some((row) => `${row.name}:${String(row.filter?.['communityId'] ?? '')}` === key)
        ) {
          return null;
        }
        const row: Automation = {
          ...AUTOMATION,
          id: `atm_${stored.length}`,
          name: input.name,
          description: input.description ?? null,
          triggers: [...input.triggers],
          actions: input.actions,
          filter: input.filter ?? null,
          source: input.source ?? 'user',
        };
        stored.push(row);
        return row;
      }),
    });
    const { svc, appended } = build(repo);
    const created = {
      type: 'organization.created',
      version: 1,
      id: 'evt_org',
      orgId: 'org-1',
      occurredAt: '2026-01-01T00:00:00Z',
      data: { id: 'org-1' },
    } as DomainEvent;
    await svc.handle(created);
    expect(stored).toHaveLength(9);
    expect(stored.every((row) => row.source === 'system')).toBe(true);
    expect(appended).toHaveLength(9);
    await svc.handle(created);
    expect(stored).toHaveLength(9);
    expect(appended).toHaveLength(9);
    expect(repo.insert).not.toHaveBeenCalled();
  });

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
    expect(result).toEqual({
      index: 0,
      type: 'sendEmail',
      status: 'completed',
      recipients: ['s1'],
    });
    expect(mailer.send).toHaveBeenCalledWith('bob@example.com', 'accessGranted', {
      contentTitle: 'Intro',
      contentId: 'c1',
      contentType: 'course',
    });
  });

  it('replaces an unclassified error with a generic one and logs the original', async () => {
    const { logger, entries } = createCapturingLogger();
    const { svc } = build(
      fakeRepo(),
      fakeRunsRepo(),
      fakeEngine(),
      fakeMailer(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      logger,
    );
    const failure = svc.runAction(
      dispatch({ type: 'grantAccess', input: { contentId: 'c1' } }, ENTITLEMENT_CREATED_EVENT),
      0,
    );
    await expect(failure).rejects.toThrow(ActionFailedError);
    await expect(failure).rejects.toThrow(/^The action failed$/);
    expect(entries.find((entry) => entry.level === 'error')?.meta).toEqual(
      expect.objectContaining({
        runId: 'run_1',
        index: 0,
        err: new Error('grantAccess: no grant writer configured'),
      }),
    );
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

  it('throws when every email fails — the engine owns retry — and logs the error', async () => {
    const mailer = fakeMailer({ send: vi.fn().mockRejectedValue(new Error('smtp down')) });
    const { logger, entries } = createCapturingLogger();
    const { svc } = build(
      fakeRepo(),
      fakeRunsRepo(),
      fakeEngine(),
      mailer,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      logger,
    );
    await expect(
      svc.runAction(
        dispatch(
          { type: 'sendEmail', input: { template: 'accessGranted' } },
          ENTITLEMENT_CREATED_EVENT,
        ),
        0,
      ),
    ).rejects.toThrow('sendEmail: delivery failed for all 1 recipients');
    expect(entries.find((entry) => entry.level === 'error')).toEqual({
      level: 'error',
      msg: 'automation action failed',
      meta: {
        orgId: 'org-1',
        automationId: 'atm_1',
        runId: 'run_1',
        trigger: 'entitlement.created',
        index: 0,
        type: 'sendEmail',
        err: expect.any(Error),
      },
    });
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

  it('logs a failed run at error with the failing action', async () => {
    const { logger, entries } = createCapturingLogger();
    const { svc } = build(
      fakeRepo(),
      fakeRunsRepo(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      logger,
    );
    await svc.finalize(dispatch, [
      { index: 0, type: 'sendEmail', status: 'failed', error: 'smtp down' },
    ]);
    expect(entries).toContainEqual({
      level: 'error',
      msg: 'automation run failed',
      meta: {
        orgId: 'org-1',
        automationId: 'atm_1',
        runId: 'run_1',
        trigger: 'entitlement.created',
        eventId: 'evt_1',
        index: 0,
        action: 'sendEmail',
        error: 'smtp down',
      },
    });
  });

  it('logs a run whose deliveries partly failed at warn', async () => {
    const { logger, entries } = createCapturingLogger();
    const { svc } = build(
      fakeRepo(),
      fakeRunsRepo(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      logger,
    );
    await svc.finalize(dispatch, [
      {
        index: 0,
        type: 'sendEmail',
        status: 'completed',
        recipients: ['s1'],
        error: 'delivery failed for 1 recipients: s2',
      },
    ]);
    expect(entries.filter((entry) => entry.level === 'error')).toEqual([]);
    expect(entries).toContainEqual({
      level: 'warn',
      msg: 'automation run completed with failed deliveries',
      meta: expect.objectContaining({
        runId: 'run_1',
        actions: [{ index: 0, type: 'sendEmail', error: 'delivery failed for 1 recipients: s2' }],
      }),
    });
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

  it('rejects a schedule the matcher cannot run', async () => {
    const { svc, repo, append } = build();
    await expect(
      svc.create('org-1', {
        name: 'Every five',
        triggers: ['schedule:*/5 * * * *'],
        actions: [{ type: 'sendEmail', input: { template: 'accessGranted' } }],
      }),
    ).rejects.toThrow(InvalidTriggerError);
    expect(repo.insert).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('rejects a trigger the system does not emit, on create and update', async () => {
    const { svc, repo, append } = build();
    const actions = [{ type: 'sendEmail', input: { template: 'accessGranted' } }];
    await expect(
      svc.create('org-1', { name: 'Typo', triggers: ['entitlement.creatd'], actions }),
    ).rejects.toThrow(InvalidTriggerError);
    await expect(
      svc.update('org-1', 'atm_1', { triggers: ['entitlement.created', 'lesson.watched'] }),
    ).rejects.toThrow(InvalidTriggerError);
    expect(repo.insert).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('accepts catalog triggers and supported schedules', async () => {
    const { svc, repo } = build();
    await svc.create('org-1', {
      name: 'Hourly',
      triggers: ['schedule:0 * * * *', 'discussion.message.sent'],
      actions: [{ type: 'publishDuePosts', input: {} }],
    });
    expect(repo.insert).toHaveBeenCalledTimes(1);
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

  it('refuses to delete a system automation', async () => {
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue({ ...AUTOMATION, source: 'system' }),
    });
    const { svc } = build(repo);
    await expect(svc.delete('org-1', 'atm_1')).rejects.toBeInstanceOf(ConflictError);
    expect(repo.delete).not.toHaveBeenCalled();
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

  it('keeps a webhook signing secret reference out of listed and fetched automations', async () => {
    const repo = fakeRepo({
      listByOrg: vi.fn().mockResolvedValue([AUTOMATION, WEBHOOK_AUTOMATION]),
      findById: vi.fn().mockResolvedValue(WEBHOOK_AUTOMATION),
    });
    const { svc } = build(repo);
    const listed = await svc.list('org-1');
    expect(listed[0]).toEqual(AUTOMATION);
    expect(listed[1]!.actions).toEqual([
      { type: 'deliverWebhook', input: { url: 'https://crm.example.com/hooks' } },
    ]);
    const fetched = await svc.get('org-1', 'atm_wh');
    expect(fetched!.actions[0]!.input).not.toHaveProperty('secretRef');
  });

  it.each([
    {
      type: 'discussion.message.sent',
      hidden: 'body',
      data: {
        orgId: 'org-1',
        id: 'msg_1',
        communityId: 'cmy_1',
        chatId: 'cht_1',
        orgUserId: 'ou_1',
        body: 'my private message',
        replyToId: null,
        editedAt: null,
        deletedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    },
    {
      type: 'organization.invite.created',
      hidden: 'tokenHash',
      data: {
        id: 'inv_1',
        orgId: 'org-1',
        email: 'ann@example.com',
        role: 'student',
        status: 'pending',
        invitedBy: 'ou_1',
        tokenHash: 'hash',
        expiresAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  ])(
    'lists $type runs with only the published fields of the event',
    async ({ type, hidden, data }) => {
      const event = {
        type,
        version: 1,
        id: 'evt_9',
        orgId: 'org-1',
        occurredAt: '2026-01-01T00:00:00Z',
        metadata: { requestId: 'req_1' },
        data,
      } as unknown as DomainEvent;
      const runsRepo = fakeRunsRepo({
        list: vi.fn().mockResolvedValue({
          rows: [{ ...RUN, trigger: type, event }],
          total: 1,
          page: 1,
          pageSize: 20,
        }),
      });
      const { svc } = build(fakeRepo(), runsRepo);
      const page = await svc.listRuns('org-1', 'atm_1', { page: 1, pageSize: 20 });
      const listed = page.rows[0]!.event;
      expect(listed).not.toHaveProperty('metadata');
      expect(listed.data).not.toHaveProperty(hidden);
      expect(listed.data).toEqual(expect.objectContaining({ id: data.id, orgId: 'org-1' }));
      expect(page.total).toBe(1);
    },
  );

  it('lists a run whose event has no published shape without its data', async () => {
    const event = { ...ENTITLEMENT_CREATED_EVENT, type: 'automation.created' } as DomainEvent;
    const runsRepo = fakeRunsRepo({
      list: vi
        .fn()
        .mockResolvedValue({ rows: [{ ...RUN, event }], total: 1, page: 1, pageSize: 20 }),
    });
    const { svc } = build(fakeRepo(), runsRepo);
    const page = await svc.listRuns('org-1', 'atm_1', { page: 1, pageSize: 20 });
    expect(page.rows[0]!.event.data).toBeNull();
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
      expect.objectContaining({ type: 'notify', source: 'system' }),
      expect.objectContaining({ type: 'grantAccess', source: 'system' }),
      expect.objectContaining({ type: 'publishDuePosts', source: 'system' }),
      expect.objectContaining({ type: 'expireDueGrants', source: 'system' }),
      expect.objectContaining({ type: 'sendDigest', source: 'system' }),
      expect.objectContaining({ type: 'removeUnattachedUploads', source: 'system' }),
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
    expect(svc.availableActions().map((a) => a.type)).toEqual([
      'sendEmail',
      'notify',
      'grantAccess',
      'publishDuePosts',
      'expireDueGrants',
      'sendDigest',
      'removeUnattachedUploads',
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
  const FAILED_RUN: AutomationRun = {
    ...RUN,
    status: 'failed',
    actionResults: [{ index: 0, type: 'sendEmail', status: 'failed', error: 'smtp down' }],
    finishedAt: new Date('2026-01-02T00:00:05Z'),
  };

  it('restarts the same run and dispatches it again', async () => {
    const runsRepo = fakeRunsRepo({ findById: vi.fn().mockResolvedValue(FAILED_RUN) });
    const { svc, engine, appended } = build(fakeRepo(), runsRepo);

    const run = await svc.rerun('org-1', 'atm_1', 'run_1');

    expect(run).toEqual(RUN);
    expect(runsRepo.restart).toHaveBeenCalledWith(
      'org-1',
      'run_1',
      new Date('2026-01-02T00:00:00.000Z'),
    );
    expect(runsRepo.insert).not.toHaveBeenCalled();
    expect(appended).toEqual([
      expect.objectContaining({ type: 'automation.run.started', data: RUN }),
    ]);
    expect(engine.dispatch).toHaveBeenCalledWith({
      runId: 'run_1',
      orgId: 'org-1',
      automationId: 'atm_1',
      actions: AUTOMATION.actions,
      event: ENTITLEMENT_CREATED_EVENT,
    });
  });

  it('reruns with the full stored event and returns only its published fields', async () => {
    const event = {
      type: 'discussion.message.sent',
      version: 1,
      id: 'evt_9',
      orgId: 'org-1',
      occurredAt: '2026-01-01T00:00:00Z',
      data: {
        orgId: 'org-1',
        id: 'msg_1',
        communityId: 'cmy_1',
        chatId: 'cht_1',
        orgUserId: 'ou_1',
        body: 'my private message',
        replyToId: null,
        editedAt: null,
        deletedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    } as unknown as DomainEvent;
    const stored = { ...FAILED_RUN, trigger: event.type, event };
    const runsRepo = fakeRunsRepo({
      findById: vi.fn().mockResolvedValue(stored),
      restart: vi.fn().mockResolvedValue({ ...stored, status: 'running', actionResults: [] }),
    });
    const { svc, engine } = build(fakeRepo(), runsRepo);

    const run = await svc.rerun('org-1', 'atm_1', 'run_1');

    expect(vi.mocked(engine.dispatch).mock.calls[0]![0].event).toEqual(event);
    expect(run.event.data).not.toHaveProperty('body');
    expect(run.event.data).toEqual(expect.objectContaining({ id: 'msg_1', chatId: 'cht_1' }));
  });

  it('refuses a run that is still running', async () => {
    const runsRepo = fakeRunsRepo({ restart: vi.fn().mockResolvedValue(null) });
    const { svc, engine, append } = build(fakeRepo(), runsRepo);
    await expect(svc.rerun('org-1', 'atm_1', 'run_1')).rejects.toThrow(ConflictError);
    expect(append).not.toHaveBeenCalled();
    expect(engine.dispatch).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the run belongs to another automation', async () => {
    const runsRepo = fakeRunsRepo({
      findById: vi.fn().mockResolvedValue({ ...FAILED_RUN, automationId: 'atm_other' }),
    });
    const { svc, engine } = build(fakeRepo(), runsRepo);
    await expect(svc.rerun('org-1', 'atm_1', 'run_1')).rejects.toThrow(NotFoundError);
    expect(runsRepo.restart).not.toHaveBeenCalled();
    expect(engine.dispatch).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the automation no longer exists', async () => {
    const runsRepo = fakeRunsRepo({ findById: vi.fn().mockResolvedValue(FAILED_RUN) });
    const { svc, engine } = build(
      fakeRepo({ findById: vi.fn().mockResolvedValue(null) }),
      runsRepo,
    );
    await expect(svc.rerun('org-1', 'atm_1', 'run_1')).rejects.toThrow(NotFoundError);
    expect(runsRepo.restart).not.toHaveBeenCalled();
    expect(engine.dispatch).not.toHaveBeenCalled();
  });

  it('records the run as failed again when dispatch fails', async () => {
    const failed = { ...RUN, status: 'failed' as const };
    const runsRepo = fakeRunsRepo({
      findById: vi.fn().mockResolvedValue(FAILED_RUN),
      recordOutcome: vi.fn().mockResolvedValue(failed),
    });
    const engine = fakeEngine({ dispatch: vi.fn().mockRejectedValue(new Error('queue down')) });
    const { svc } = build(fakeRepo(), runsRepo, engine);
    await expect(svc.rerun('org-1', 'atm_1', 'run_1')).resolves.toEqual(failed);
    expect(runsRepo.recordOutcome).toHaveBeenCalledWith(
      'org-1',
      'run_1',
      expect.objectContaining({ status: 'failed' }),
    );
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

  const deliver = async (event: DomainEvent) => {
    const webhooks = fakeWebhooks(204);
    const { svc } = buildWith(webhooks);
    await svc.runAction({ ...dispatch, event }, 0);
    const [request] = vi.mocked(webhooks.send).mock.calls[0]!;
    return JSON.parse(request.body) as { data: Record<string, unknown> };
  };

  it('POSTs the event, signed per Standard Webhooks', async () => {
    const webhooks = fakeWebhooks(204);
    const { svc } = buildWith(webhooks);

    const result = await svc.runAction(dispatch, 0);

    expect(result).toEqual({ index: 0, type: 'deliverWebhook', status: 'completed' });
    const [request] = vi.mocked(webhooks.send).mock.calls[0]!;
    const timestamp = String(Math.floor(new Date('2026-01-02T00:00:00Z').getTime() / 1000));
    const key = Buffer.from(WEBHOOK_SECRET.slice('whsec_'.length), 'base64');
    const expected = createHmac('sha256', key)
      .update(`evt_1.${timestamp}.${request.body}`)
      .digest('base64');
    expect(request.url).toBe('https://crm.example.com/hooks');
    expect(request.headers).toEqual({
      'content-type': 'application/json',
      'webhook-id': 'evt_1',
      'webhook-timestamp': timestamp,
      'webhook-signature': `v1,${expected}`,
    });
    expect(JSON.parse(request.body)).toEqual({
      id: 'evt_1',
      type: 'entitlement.created',
      version: 1,
      orgId: 'org-1',
      occurredAt: '2026-01-01T00:00:00Z',
      data: {
        orgId: 'org-1',
        id: 'e1',
        orgUserId: 's1',
        bundleId: null,
        contentId: 'c1',
        status: 'active',
        source: 'manual',
        grantedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });
  });

  it('sends the envelope and only the fields the event publishes', async () => {
    const body = await deliver({
      type: 'content.course.activity.updated',
      version: 1,
      id: 'evt_3',
      orgId: 'org-1',
      occurredAt: '2026-09-29T13:21:17.819Z',
      metadata: { requestId: 'req_1' },
      data: {
        orgId: 'org-1',
        id: 'act_1',
        moduleId: 'mod_1',
        courseId: 'crs_1',
        seq: 0,
        settings: {
          title: 'Instrumenting your first events',
          published: true,
          content: {
            type: 'plate',
            version: 1,
            config: [{ type: 'video', url: 'https://storage.test/broll.mp4?X-Amz-Signature=abc' }],
          },
        },
        createdAt: '2026-08-04T14:05:03.184Z',
        updatedAt: '2026-09-29T13:21:17.821Z',
      },
    } as unknown as DomainEvent);

    expect(body).toEqual({
      id: 'evt_3',
      type: 'content.course.activity.updated',
      version: 1,
      orgId: 'org-1',
      occurredAt: '2026-09-29T13:21:17.819Z',
      data: {
        orgId: 'org-1',
        id: 'act_1',
        moduleId: 'mod_1',
        courseId: 'crs_1',
        seq: 0,
        createdAt: '2026-08-04T14:05:03.184Z',
        updatedAt: '2026-09-29T13:21:17.821Z',
      },
    });
  });

  it.each([
    {
      field: 'tokenHash',
      type: 'organization.invite.created',
      data: {
        id: 'inv_1',
        orgId: 'org-1',
        email: 'ann@example.com',
        role: 'student',
        status: 'pending',
        invitedBy: 'ou_1',
        tokenHash: 'hash',
        expiresAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    },
    {
      field: 'credentialRef',
      type: 'integration.connection.created',
      data: {
        orgId: 'org-1',
        id: 'con_1',
        integrationId: 'kit',
        config: { list: 'l1' },
        active: true,
        credentialRef: 'crd_9',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    },
    {
      field: 'position',
      type: 'progress.record.completed',
      data: {
        id: 'prg_1',
        orgId: 'org-1',
        orgUserId: 'ou_1',
        targetType: 'activity',
        targetId: 'act_1',
        startedAt: '2026-01-01T00:00:00.000Z',
        position: { seconds: 42 },
        completedAt: '2026-01-01T00:10:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:10:00.000Z',
      },
    },
    {
      field: 'externalId',
      type: 'identity.user.created',
      data: {
        id: 'usr_1',
        externalId: 'ext_1',
        email: 'ann@example.com',
        firstName: 'Ann',
        lastName: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    },
    {
      field: 'externalId',
      type: 'organization.updated',
      data: {
        id: 'org-1',
        externalId: 'ext_org',
        name: 'Acme',
        slug: 'acme',
        ownerId: 'usr_1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  ])('leaves $field out of $type', async ({ field, type, data }) => {
    const body = await deliver({
      type,
      version: 1,
      id: 'evt_4',
      orgId: 'org-1',
      occurredAt: '2026-01-01T00:00:00Z',
      data,
    } as unknown as DomainEvent);

    expect(body.data['id']).toBe(data.id);
    expect(body.data).not.toHaveProperty(field);
  });

  it('fails the delivery for an event that is not published', async () => {
    const webhooks = fakeWebhooks(204);
    const { svc } = buildWith(webhooks);
    const event = { ...ENTITLEMENT_CREATED_EVENT, type: 'automation.created' } as DomainEvent;

    await expect(svc.runAction({ ...dispatch, event }, 0)).rejects.toThrow(/not published/);
    expect(webhooks.send).not.toHaveBeenCalled();
  });

  it('fails the delivery when the event data does not match its published shape', async () => {
    const webhooks = fakeWebhooks(204);
    const { svc } = buildWith(webhooks);
    const { contentId: _contentId, ...incomplete } = RELAYED_ENTITLEMENT;
    const event = { ...ENTITLEMENT_CREATED_EVENT, data: incomplete } as DomainEvent;

    await expect(svc.runAction({ ...dispatch, event }, 0)).rejects.toThrow(/published shape/);
    expect(webhooks.send).not.toHaveBeenCalled();
  });

  it('throws on a non-2xx response so the engine retries', async () => {
    const { svc } = buildWith(fakeWebhooks(500));
    await expect(svc.runAction(dispatch, 0)).rejects.toThrow(/responded 500/);
  });

  it('records an unreachable endpoint without the transport error', async () => {
    const webhooks: WebhookSender = {
      send: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432')),
    };
    const { svc } = buildWith(webhooks);
    const failure = svc.runAction(dispatch, 0);
    await expect(failure).rejects.toThrow(ActionFailedError);
    await expect(failure).rejects.toThrow('deliverWebhook: the endpoint could not be reached');
  });

  it('throws when the signing secret is gone', async () => {
    const { svc } = buildWith(
      fakeWebhooks(),
      fakeCredentials({ reveal: vi.fn().mockResolvedValue(null) }),
    );
    await expect(svc.runAction(dispatch, 0)).rejects.toThrow(/signing secret not found/);
  });
});

describe('fireSchedule', () => {
  const due = {
    ...AUTOMATION,
    triggers: ['schedule:* * * * *'],
    actions: [{ type: 'publishDuePosts', input: {} }],
  };

  it('does not open a run when no post is due', async () => {
    const hasDuePosts = vi.fn().mockResolvedValue(false);
    const repo = fakeRepo({ findById: vi.fn().mockResolvedValue(due) });
    const { svc, engine } = build(
      repo,
      fakeRunsRepo(),
      fakeEngine(),
      fakeMailer(),
      fakeIntegrations(),
      fakeLookups(),
      fakeCredentials(),
      fakeWebhooks(),
      { ...emptyScheduledWork, hasDuePosts },
    );

    await svc.fireSchedule('org-1', due.id, new Date('2026-01-02T00:05:00Z'));

    expect(hasDuePosts).toHaveBeenCalledWith('org-1', new Date('2026-01-02T00:05:00Z'));
    expect(engine.dispatch).not.toHaveBeenCalled();
  });

  it('opens a run when a post is due', async () => {
    const hasDuePosts = vi.fn().mockResolvedValue(true);
    const repo = fakeRepo({ findById: vi.fn().mockResolvedValue(due) });
    const { svc, engine } = build(
      repo,
      fakeRunsRepo(),
      fakeEngine(),
      fakeMailer(),
      fakeIntegrations(),
      fakeLookups(),
      fakeCredentials(),
      fakeWebhooks(),
      { ...emptyScheduledWork, hasDuePosts },
    );

    await svc.fireSchedule('org-1', due.id, new Date('2026-01-02T00:05:00Z'));

    expect(engine.dispatch).toHaveBeenCalledOnce();
  });
});

describe('schedule reconcile after commit', () => {
  it('keeps a committed create when the engine cannot reconcile its schedules', async () => {
    const engine = fakeEngine({
      syncSchedules: vi.fn().mockRejectedValue(new Error('hatchet down')),
    });
    const { svc, appended } = build(fakeRepo(), fakeRunsRepo(), engine);
    await expect(
      svc.create('org-1', {
        name: 'Daily',
        triggers: ['schedule:0 7 * * *'],
        actions: [{ type: 'sendDigest', input: {} }],
      }),
    ).resolves.toEqual(AUTOMATION);
    expect(engine.syncSchedules).toHaveBeenCalledOnce();
    expect(appended).toEqual([expect.objectContaining({ type: 'automation.created' })]);
  });

  it('keeps a committed update and delete when the engine cannot reconcile', async () => {
    const engine = fakeEngine({
      syncSchedules: vi.fn().mockRejectedValue(new Error('hatchet down')),
    });
    const { svc } = build(fakeRepo(), fakeRunsRepo(), engine);
    await expect(svc.update('org-1', 'atm_1', { name: 'Renamed' })).resolves.toEqual(AUTOMATION);
    await expect(svc.delete('org-1', 'atm_1')).resolves.toBe(true);
  });
});

describe('fireSchedule work and slots', () => {
  function scheduled(type: string, createdAt = new Date('2026-01-01T00:00:00Z')): Automation {
    return {
      ...AUTOMATION,
      triggers: ['schedule:0 * * * *'],
      actions: [{ type, input: {} }],
      createdAt,
    };
  }

  function withWork(automation: Automation, work: Partial<ScheduledWork>) {
    return build(
      fakeRepo({ findById: vi.fn().mockResolvedValue(automation) }),
      fakeRunsRepo(),
      fakeEngine(),
      fakeMailer(),
      fakeIntegrations(),
      fakeLookups(),
      fakeCredentials(),
      fakeWebhooks(),
      { ...emptyScheduledWork, ...work },
    );
  }

  it('opens no run when no grant is due', async () => {
    const hasDueGrants = vi.fn().mockResolvedValue(false);
    const { svc, engine, runsRepo } = withWork(scheduled('expireDueGrants'), { hasDueGrants });
    await svc.fireSchedule('org-1', 'atm_1', new Date('2026-01-02T01:00:00Z'));
    expect(hasDueGrants).toHaveBeenCalledWith('org-1', new Date('2026-01-02T01:00:00Z'));
    expect(runsRepo.insert).not.toHaveBeenCalled();
    expect(engine.dispatch).not.toHaveBeenCalled();
  });

  it('opens a run when a grant is due', async () => {
    const hasDueGrants = vi.fn().mockResolvedValue(true);
    const { svc, engine } = withWork(scheduled('expireDueGrants'), { hasDueGrants });
    await svc.fireSchedule('org-1', 'atm_1', new Date('2026-01-02T01:00:00Z'));
    expect(engine.dispatch).toHaveBeenCalledOnce();
  });

  it('opens no run when no upload is unattached', async () => {
    const hasUnattachedUploads = vi.fn().mockResolvedValue(false);
    const { svc, engine } = withWork(scheduled('removeUnattachedUploads'), {
      hasUnattachedUploads,
    });
    await svc.fireSchedule('org-1', 'atm_1', new Date('2026-01-02T01:00:00Z'));
    expect(hasUnattachedUploads).toHaveBeenCalledWith('org-1', new Date('2026-01-02T01:00:00Z'));
    expect(engine.dispatch).not.toHaveBeenCalled();
  });

  it('always runs an automation with an action it cannot ask about', async () => {
    const automation = {
      ...scheduled('expireDueGrants'),
      actions: [
        { type: 'expireDueGrants', input: {} },
        { type: 'sendDigest', input: {} },
      ],
    };
    const { svc, engine } = withWork(automation, {
      hasDueGrants: vi.fn().mockResolvedValue(false),
    });
    await svc.fireSchedule('org-1', 'atm_1', new Date('2026-01-02T01:00:00Z'));
    expect(engine.dispatch).toHaveBeenCalledOnce();
  });

  it('keys the run on the slot minute so a late fire of a slot dedupes', async () => {
    const { svc, runsRepo } = withWork(scheduled('sendDigest'), {});
    await svc.fireSchedule('org-1', 'atm_1', new Date('2026-01-02T07:00:42.123Z'));
    expect(runsRepo.insert).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        event: expect.objectContaining({
          id: 'schedule_atm_1_2026-01-02T07:00:00.000Z',
          data: { automationId: 'atm_1', firedAt: '2026-01-02T07:00:00.000Z' },
        }),
      }),
    );
  });

  it('opens no second run for a slot that already ran', async () => {
    const insert = vi.fn().mockResolvedValueOnce(RUN).mockResolvedValue(null);
    const automation = scheduled('sendDigest');
    const { svc, engine } = build(
      fakeRepo({ findById: vi.fn().mockResolvedValue(automation) }),
      fakeRunsRepo({ insert }),
    );
    await svc.fireSchedule('org-1', 'atm_1', new Date('2026-01-02T07:00:00Z'));
    await svc.fireSchedule('org-1', 'atm_1', new Date('2026-01-02T07:00:30Z'));
    expect(insert.mock.calls[0]![1].event.id).toBe(insert.mock.calls[1]![1].event.id);
    expect(engine.dispatch).toHaveBeenCalledOnce();
  });

  it('never fires a slot from before the automation existed', async () => {
    const { svc, runsRepo } = withWork(
      scheduled('sendDigest', new Date('2026-01-02T08:15:00Z')),
      {},
    );
    await svc.fireSchedule('org-1', 'atm_1', new Date('2026-01-02T07:00:00Z'));
    expect(runsRepo.insert).not.toHaveBeenCalled();
  });
});
