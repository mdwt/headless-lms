// Wires adapters + services in dependency order. Starts nothing.
import {
  createDb,
  DrizzleAssetsRepository,
  DrizzleAutomationRunsRepository,
  DrizzleAutomationsRepository,
  DrizzleConnectionsRepository,
  DrizzleContentRepository,
  DrizzleCredentialStore,
  DrizzleCourseAnalyticsRepository,
  DrizzleDashboardRepository,
  DrizzleDiscussionRepository,
  DrizzleEntitlementsRepository,
  DrizzleIdentityRepository,
  DrizzleLearnRepository,
  DrizzleMembersRepository,
  DrizzleOrganizationsRepository,
  DrizzleOutboxAppender,
  DrizzleOutboxStore,
  DrizzleProgressRepository,
  DrizzleSettingsRepository,
  DrizzleStudentsRepository,
  DrizzleUnitOfWork,
} from '@headless-lms/adapter-db';
import { InMemoryEventBus } from '@headless-lms/adapter-defaults/events';
import {
  PollingOutboxRelay,
  type PollingOutboxRelayConfig,
} from '@headless-lms/adapter-defaults/events/outbox-relay';
import { InlineAutomationEngine } from '@headless-lms/adapter-defaults/workflows';
import { EmailAdapter, StubTemplateRenderer } from '@headless-lms/adapter-defaults/email';
import {
  createRootLogger,
  type LogLevel,
  type PinoInstance,
  requestLogContext,
  type RequestLogContext,
} from '@headless-lms/adapter-defaults/logging';
import { StorageAdapter } from '@headless-lms/adapter-defaults/storage';
import { BetterAuth } from '@headless-lms/adapter-auth';

import { ContentService } from '@headless-lms/core/content';
import { EntitlementsServiceImpl } from '@headless-lms/core/entitlements';
import { ProgressServiceImpl } from '@headless-lms/core/progress';
import { DiscussionServiceImpl } from '@headless-lms/core/discussion';
import { IdentityServiceImpl, type SessionAdmin } from '@headless-lms/core/identity';
import {
  type OrgAdmin,
  OrganizationServiceImpl,
  parseRole,
} from '@headless-lms/core/organizations';
import { AssetsServiceImpl } from '@headless-lms/core/assets';
import { IntegrationsServiceImpl } from '@headless-lms/core/integrations';
import { AutomationsServiceImpl } from '@headless-lms/core/automations';
import { loadIntegrations } from './integrations.js';
import { registerNotificationSubscribers } from './notifications.js';
import { StudentsReportServiceImpl } from '@headless-lms/core/reporting/students';
import { DashboardReportServiceImpl } from '@headless-lms/core/reporting/dashboard';
import { CoursesReportServiceImpl } from '@headless-lms/core/reporting/courses';
import { LearnReportServiceImpl } from '@headless-lms/core/reporting/learn';
import { Mailer, type MailerLookups } from '@headless-lms/core/shared/mailer';
import { SettingsService } from '@headless-lms/core/shared/settings';

import type {
  CredentialStore,
  EmailSender,
  Logger,
  ObjectStorage,
  OutboxRelay,
  TemplateContext,
  TemplateRenderer,
} from '@headless-lms/core/shared/ports';
import type { AutomationEngine } from '@headless-lms/core/types';

/** Installation-supplied ports; an absent slot falls back to a fail-loudly stub. */
export interface AdapterOverrides {
  email?: EmailSender;
  storage?: ObjectStorage;
  /** Resolves email templates to rendered content. Absent → fail-loudly stub. */
  templates?: TemplateRenderer;
  /** Durable automation engine. Absent → InlineAutomationEngine (in-process, one attempt per action). */
  workflows?: AutomationEngine;
}

export interface BuildContainerOptions {
  /** Installation's plugins folder, scanned by loadIntegrations. Absent → no integrations. */
  pluginsDir?: string;
  adapters?: AdapterOverrides;
}

export interface Config {
  databaseUrl: string;
  authBaseURL: string;
  authSecret: string;
  trustedOrigins: string[];
  /** Branding threaded into every email template. Default: brandName "Headless LMS", baseUrl = adminAppUrl.
   *  (studentPortalUrl is composed in from the top-level config field.) */
  emailBranding?: Omit<TemplateContext, 'studentPortalUrl'>;
  /** base64-encoded 32-byte key for the credential store (CREDENTIAL_STORE_KEY). */
  credentialStoreKey: string;
  /** Parent domain for cross-subdomain session cookies (e.g. ".example.com"); undefined → host-only cookie. */
  cookieDomain?: string;
  /** Mark session cookies Secure (set behind HTTPS / in production). */
  secureCookies?: boolean;
  /** Student portal origin — invite links for students, and the origin whose signups are invite-gated. */
  studentPortalUrl: string;
  /** Admin app origin — invite links for staff. */
  adminAppUrl: string;
  /** Transactional-outbox relay tuning. All optional — see OUTBOX_DEFAULTS. */
  outbox?: OutboxConfig;
  /** Log level for the process-wide logger (HTTP + domain + relay). Default "info". */
  logging?: LoggingConfig;
  /** Presigned URL lifetime for entitled download delivery, seconds. Mirrors
   *  ServerConfig.deliveryExpirySeconds — createContainer threads it through. */
  deliveryExpirySeconds: number;
}

/** Tuning for the transactional-outbox relay. Every field is optional; the
 *  container resolves against OUTBOX_DEFAULTS. */
export interface OutboxConfig {
  /** Master switch for the same-process relay. Default true. */
  enabled?: boolean;
  /** Idle delay between polls. Default 1000. */
  pollIntervalMs?: number;
  /** Max rows fetched/dispatched per tick. Default 100. */
  batchSize?: number;
}

export const OUTBOX_DEFAULTS: PollingOutboxRelayConfig = {
  enabled: true,
  pollIntervalMs: 1000,
  batchSize: 100,
};

export function resolveOutboxConfig(config: OutboxConfig = {}): PollingOutboxRelayConfig {
  const overrides = Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined),
  );
  return { ...OUTBOX_DEFAULTS, ...overrides };
}

/** Logging tuning. Optional; resolved against LOGGING_DEFAULTS. */
export interface LoggingConfig {
  /** Minimum level emitted. Default "info". */
  level?: LogLevel;
}

export const LOGGING_DEFAULTS: Required<LoggingConfig> = { level: 'info' };

export function resolveLoggingConfig(config: LoggingConfig = {}): Required<LoggingConfig> {
  return { level: config.level ?? LOGGING_DEFAULTS.level };
}

export interface Container {
  auth: BetterAuth;
  // Org Provider
  orgProvider: OrgAdmin;

  // Domains
  identity: IdentityServiceImpl;
  organizations: OrganizationServiceImpl;
  content: ContentService;
  entitlements: EntitlementsServiceImpl;
  progress: ProgressServiceImpl;
  discussion: DiscussionServiceImpl;
  assets: AssetsServiceImpl;
  integrations: IntegrationsServiceImpl;
  automations: AutomationsServiceImpl;
  /** Cross-cutting settings store. Not a context — a leaf every context may use;
   *  inject `settings.for('<namespace>')` into a service, never the service itself. */
  settings: SettingsService;
  // Reporting read layer (composed cross-context reads; owns no domain rules).
  reporting: {
    students: StudentsReportServiceImpl;
    dashboard: DashboardReportServiceImpl;
    courses: CoursesReportServiceImpl;
    learn: LearnReportServiceImpl;
  };
  storage: ObjectStorage;
  mailer: Mailer;
  /** Shared secure credential store — encrypted at rest, org-scoped, decrypt at point of use. */
  credentials: CredentialStore;
  /** The outbox relay — constructed but NEVER started by the container; the
   *  installation's entry point starts it after listen (gen-openapi must not
   *  poll). buildServer stops it onClose. */
  outboxRelay: OutboxRelay;
  /** The automation engine — constructed but NEVER started by the container;
   *  the installation's entry point starts it after listen (gen-openapi must
   *  not run a worker). buildServer stops it onClose. */
  automationEngine: AutomationEngine;
  /** Root logger port — components receive children bound with { name }. */
  logger: Logger;
  /** The raw pino root; buildServer hands it to Fastify so HTTP shares the stream. */
  loggerInstance: PinoInstance;
  /** Request-scoped log correlation; the HTTP layer enters it per request. */
  requestContext: RequestLogContext;
  /** Identity's session-write port; the auth adapter fulfils it. */
  sessions: SessionAdmin;
}

export async function buildContainer(
  config: Config,
  options?: BuildContainerOptions,
): Promise<Container> {
  const { instance: loggerInstance, logger } = createRootLogger(
    resolveLoggingConfig(config.logging).level,
  );
  // One child per domain — a context's service and repositories share it.

  const contentLogger = logger.child({ name: 'content' });
  const entitlementsLogger = logger.child({ name: 'entitlements' });
  const progressLogger = logger.child({ name: 'progress' });
  const discussionLogger = logger.child({ name: 'discussion' });
  const assetsLogger = logger.child({ name: 'assets' });
  const integrationsLogger = logger.child({ name: 'integrations' });
  const automationsLogger = logger.child({ name: 'automations' });
  const reportingLogger = logger.child({ name: 'reporting' });
  const outboxLogger = logger.child({ name: 'outbox' });

  // Outbound adapters
  const db = createDb(config.databaseUrl);
  const email = options?.adapters?.email ?? new EmailAdapter(logger.child({ name: 'email' }));
  const storage: ObjectStorage =
    options?.adapters?.storage ?? new StorageAdapter(logger.child({ name: 'storage' }));
  const templates =
    options?.adapters?.templates ?? new StubTemplateRenderer(logger.child({ name: 'email' }));
  const automationEngine: AutomationEngine =
    options?.adapters?.workflows ?? new InlineAutomationEngine();
  const mailer = new Mailer(templates, email, {
    ...(config.emailBranding ?? { brandName: 'Headless LMS', baseUrl: config.adminAppUrl }),
    studentPortalUrl: config.studentPortalUrl,
  });

  /*
   * Identity
   */
  const identityUoW = new DrizzleUnitOfWork(db, (tx) => ({
    identity: new DrizzleIdentityRepository(tx, logger.child({ name: 'identity' })),
    outbox: new DrizzleOutboxAppender(tx, logger.child({ name: 'identity' })),
  }));
  const identity = new IdentityServiceImpl({
    repo: new DrizzleIdentityRepository(db, logger.child({ name: 'identity_repo' })),
    logger: logger.child({ name: 'identity' }),
    uow: identityUoW,
    mailer,
  });

  /*
   * Organization
   */
  const organizationsUow = new DrizzleUnitOfWork(db, (tx) => ({
    organizations: new DrizzleOrganizationsRepository(tx, logger.child({ name: 'org' })),
    outbox: new DrizzleOutboxAppender(tx, logger.child({ name: 'org' })),
  }));
  const orgAdminRef: { current: OrgAdmin | undefined } = { current: undefined };
  const organizations = new OrganizationServiceImpl({
    repo: new DrizzleOrganizationsRepository(db, logger.child({ name: 'org' })),
    membersRepo: new DrizzleMembersRepository(db, logger.child({ name: 'org' })),
    people: identity,
    uow: organizationsUow,
    orgAdmin: () => {
      if (!orgAdminRef.current) {
        throw new Error('orgAdmin not initialised');
      }
      return orgAdminRef.current;
    },
    logger: logger.child({ name: 'org' }),
    mailer,
    inviteUrls: { studentPortalUrl: config.studentPortalUrl, adminAppUrl: config.adminAppUrl },
  });

  /*
   * Settings
   */
  const settings = new SettingsService(
    new DrizzleSettingsRepository(db, logger.child({ name: 'settings' })),
  );
  // Content: reads on the root db; course writes + outbox append in one tx.
  const contentUow = new DrizzleUnitOfWork(db, (tx) => ({
    content: new DrizzleContentRepository(tx, contentLogger),
    outbox: new DrizzleOutboxAppender(tx, outboxLogger),
  }));
  const content = new ContentService({
    repo: new DrizzleContentRepository(db, contentLogger),
    uow: contentUow,
    logger: contentLogger,
  });
  // Entitlements: reads on the root db; writes + outbox append in one tx.
  const entitlementsUow = new DrizzleUnitOfWork(db, (tx) => ({
    entitlements: new DrizzleEntitlementsRepository(tx, entitlementsLogger),
    outbox: new DrizzleOutboxAppender(tx, outboxLogger),
  }));
  const entitlements = new EntitlementsServiceImpl({
    repo: new DrizzleEntitlementsRepository(db, entitlementsLogger),
    uow: entitlementsUow,
    logger: entitlementsLogger,
  });
  // Progress: report writes + outbox append in one tx; content supplies the
  // structure and completion rules the service evaluates against.
  const progressUow = new DrizzleUnitOfWork(db, (tx) => ({
    progress: new DrizzleProgressRepository(tx, progressLogger),
    outbox: new DrizzleOutboxAppender(tx, outboxLogger),
  }));
  const progress = new ProgressServiceImpl({
    repo: new DrizzleProgressRepository(db, progressLogger),
    content,
    uow: progressUow,
    logger: progressLogger,
  });

  const discussion = new DiscussionServiceImpl({
    repo: new DrizzleDiscussionRepository(db, discussionLogger),
    access: entitlements,
    content: content,
    uow: new DrizzleUnitOfWork(db, (tx) => ({
      discussion: new DrizzleDiscussionRepository(tx, discussionLogger),
      outbox: new DrizzleOutboxAppender(tx, outboxLogger),
    })),
    settings,
    logger: discussionLogger,
  });
  const assets = new AssetsServiceImpl({
    storage,
    repo: new DrizzleAssetsRepository(db, assetsLogger),
    uow: new DrizzleUnitOfWork(db, (tx) => ({
      assets: new DrizzleAssetsRepository(tx, assetsLogger),
      outbox: new DrizzleOutboxAppender(tx, outboxLogger),
    })),
    logger: assetsLogger,
  });

  const reporting = {
    students: new StudentsReportServiceImpl({
      repo: new DrizzleStudentsRepository(db, reportingLogger),
      logger: reportingLogger,
    }),
    dashboard: new DashboardReportServiceImpl({
      repo: new DrizzleDashboardRepository(db, reportingLogger),
      logger: reportingLogger,
    }),
    courses: new CoursesReportServiceImpl({
      repo: new DrizzleCourseAnalyticsRepository(db, reportingLogger),
      logger: reportingLogger,
    }),
    learn: new LearnReportServiceImpl({
      reader: new DrizzleLearnRepository(db, reportingLogger),
      content,
      progress,
      assets,
      deliveryExpirySeconds: config.deliveryExpirySeconds,
      logger: reportingLogger,
    }),
  };

  const credentialStore = new DrizzleCredentialStore(
    db,
    config.credentialStoreKey,
    integrationsLogger,
  );
  // The integrations this deployment supports: the installation's declared
  // plugins folder (directory name = integration id), loaded at startup.
  // Connect/configure reject undeclared ids and validate config with the
  // integration's own schema. No folder → no integrations.
  const integrationsRegistry = await loadIntegrations(options?.pluginsDir, integrationsLogger);
  // Integrations: credential + connection writes + outbox append in one tx
  // (a tx-bound credential store instance shares the scope's transaction).
  const integrationsUow = new DrizzleUnitOfWork(db, (tx) => ({
    connections: new DrizzleConnectionsRepository(tx, integrationsLogger),
    credentials: new DrizzleCredentialStore(tx, config.credentialStoreKey, integrationsLogger),
    outbox: new DrizzleOutboxAppender(tx, outboxLogger),
  }));
  const integrations = new IntegrationsServiceImpl({
    registry: integrationsRegistry,
    repo: new DrizzleConnectionsRepository(db, integrationsLogger),
    uow: integrationsUow,
    credentials: credentialStore,
    logger: integrationsLogger,
  });

  // Automations: run writes + outbox append in one tx; the engine drives
  // execution (register below), integrations supplies the loaded
  // integrations' actions for `available`.
  const automationsUow = new DrizzleUnitOfWork(db, (tx) => ({
    automations: new DrizzleAutomationsRepository(tx, automationsLogger),
    runs: new DrizzleAutomationRunsRepository(tx, automationsLogger),
    outbox: new DrizzleOutboxAppender(tx, automationsLogger),
  }));
  // Emails triggered by row-shaped events resolve their recipient and content
  // details at send time — the event carries ids only.
  const mailerLookups: MailerLookups = {
    orgUserEmail: async (orgId, orgUserId) =>
      (await reporting.students.get(orgId, orgUserId))?.email ?? null,
    contentInfo: async (orgId, contentId) => {
      const course = await content.getCourse(orgId, contentId);
      if (course) {
        return { id: course.id, title: course.title, type: course.type };
      }
      const download = await content.getDownload(orgId, contentId);
      return download ? { id: download.id, title: download.title, type: download.type } : null;
    },
  };

  const automations = new AutomationsServiceImpl({
    repo: new DrizzleAutomationsRepository(db, automationsLogger),
    runsRepo: new DrizzleAutomationRunsRepository(db, automationsLogger),
    uow: automationsUow,
    engine: automationEngine,
    mailer,
    lookups: mailerLookups,
    integrations,
    logger: automationsLogger,
  });
  automationEngine.register(automations);

  const eventBus = new InMemoryEventBus();
  registerNotificationSubscribers(eventBus, mailer, mailerLookups);
  // handle() never throws — the EventBus fans out to every subscriber
  // sequentially, and a rejection here would break sibling subscribers.
  eventBus.subscribeAll((event) => automations.handle(event));
  const outboxConfig = resolveOutboxConfig(config.outbox);
  const outboxRelay = new PollingOutboxRelay(
    new DrizzleOutboxStore(db, outboxLogger),
    eventBus,
    outboxConfig,
    outboxLogger,
  );

  /*
   * Auth Adapter
   */
  const authLogger = logger.child({ name: 'auth' });
  // Hook failures otherwise surface through Better Auth's route as an opaque
  // 500 — log which hook died before rethrowing.
  const authHook =
    <A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      try {
        return await fn(...args);
      } catch (err) {
        authLogger.error(`auth hook ${name} failed`, { err });
        throw err;
      }
    };
  const auth = new BetterAuth({
    db,
    baseUrl: config.authBaseURL,
    secret: config.authSecret,
    trustedOrigins: config.trustedOrigins,
    hooks: {
      sendResetPassword: authHook('sendResetPassword', async (data) => {
        await identity.sendPasswordReset({
          email: data.user.email,
          url: '',
        });
      }),
      sendMagicLink: authHook('sendMagicLink', async ({ email, url }) => {
        await identity.sendMagicLink({
          email,
          url,
        });
      }),
      beforeUserCreate: authHook('beforeUserCreate', async (user) => {
        const { email, name } = user;
        const [firstName, lastName] = name.split(' ');
        // Better Auth has not minted an id yet — the id returned below becomes
        // its account id. A person provisioned at invite time is linked instead of re-created.
        const domainUser = await identity.linkOrCreateUser({
          email,
          ...(firstName !== undefined && { firstName }),
          ...(lastName !== undefined && { lastName }),
        });

        return {
          data: {
            ...user,
            id: domainUser.id,
          },
        };
      }),
      beforeCreateSession: authHook('beforeCreateSession', async (session) => {
        const person = await identity.getUserByExternalId(session.userId);
        if (!person) {
          return;
        }
        const orgs = await organizations.getOrgUsersForUser(person.id);
        if (orgs.length !== 1) {
          return;
        }
        // TODO - fix, why default to the first?
        const org = await organizations.getById(orgs[0]!.orgId);
        if (!org) {
          return;
        }

        return { data: { ...session, activeOrganizationId: org.id } };
      }),
      /*
       * We're making sure the domain org creates and using the same ID for better-auth org ID.
       */
      beforeCreateOrganization: authHook(
        'beforeCreateOrganization',
        async ({ organization: org, user: baUser }) => {
          const domainOrg = await organizations.createOrganization({
            ownerId: baUser.id,
            ...org,
            logo: org.logo ?? undefined,
          });
          return { data: { ...org, id: domainOrg.id } };
        },
      ),
      beforeUpdateOrganization: authHook('beforeUpdateOrganization', async ({ organization }) => {
        await organizations.updateOrganization(organization.id, organization);
      }),
      beforeDeleteOrganization: authHook('beforeDeleteOrganization', async ({ organization }) => {
        await organizations.deleteOrganization(organization.id);
      }),
      beforeAddMember: authHook('beforeAddMember', async ({ member }) => {
        await organizations.addOrgUser({
          orgId: member.organizationId,
          userId: member.userId,
          role: parseRole(member.role),
        });
      }),
      beforeUpdateMemberRole: authHook('beforeUpdateMemberRole', async ({ member, newRole }) => {
        await organizations.updateOrgUser(member.organizationId, member.userId, {
          role: parseRole(newRole),
        });
      }),
      beforeRemoveMember: authHook('beforeRemoveMember', async ({ member }) => {
        await organizations.removeOrgUser(member.organizationId, member.userId);
      }),
    },
    logger: authLogger,
    cookieDomain: config.cookieDomain,
    secureCookies: config.secureCookies,
  });
  orgAdminRef.current = auth;

  return {
    auth,
    identity,
    organizations,
    // Better Auth owns org writes; the same instance fulfils the OrgAdmin port.
    orgProvider: auth,
    content,
    entitlements,
    progress,
    discussion,
    assets,
    integrations,
    automations,
    settings,
    reporting,
    storage,
    mailer,
    credentials: credentialStore,
    outboxRelay,
    automationEngine,
    logger,
    loggerInstance,
    requestContext: requestLogContext,
    // Better Auth owns the session store; the same instance fulfils SessionAdmin.
    sessions: auth,
  };
}
