// Wires adapters + services in dependency order. Starts nothing.
import {
  createDb,
  type DatabasePoolOptions,
  DrizzleAssetsRepository,
  DrizzleAutomationRunsRepository,
  DrizzleAutomationsRepository,
  DrizzleConnectionsRepository,
  DrizzleContentRepository,
  DrizzleCredentialStore,
  DrizzleAdminRepository,
  DrizzleDigestRunRepository,
  DrizzleDevicesRepository,
  DrizzleDiscussionRepository,
  DrizzlePostRepository,
  DrizzleChatRepository,
  DrizzleEntitlementsRepository,
  DrizzleIdentityRepository,
  DrizzleMemberRepository,
  DrizzleMembersRepository,
  DrizzleMentionsRepository,
  DrizzleNotificationsRepository,
  DrizzleNotificationSettingsRepository,
  DrizzleOrganizationsRepository,
  DrizzleRolesRepository,
  DrizzleOutboxAppender,
  DrizzleOutboxStore,
  DrizzleProgressRepository,
  DrizzleSettingsRepository,
  DrizzleSubscriptionsRepository,
  DrizzleUnitOfWork,
} from '@headless-lms/adapter-db';
import { InMemoryEventBus } from '@headless-lms/adapter-defaults/events';
import {
  PollingOutboxRelay,
  type PollingOutboxRelayConfig,
} from '@headless-lms/adapter-defaults/events/outbox-relay';
import { InlineAutomationEngine } from '@headless-lms/adapter-defaults/workflows';
import { FetchWebhookSender } from '@headless-lms/adapter-defaults/webhooks';
import { EmailAdapter, StubTemplateRenderer } from '@headless-lms/adapter-defaults/email';
import {
  createRootLogger,
  type LogLevel,
  type PinoInstance,
  requestLogContext,
  type RequestLogContext,
} from '@headless-lms/adapter-defaults/logging';
import { StorageAdapter } from '@headless-lms/adapter-defaults/storage';
import { PlainBodyParser } from '@headless-lms/adapter-defaults/body';
import { BetterAuth } from '@headless-lms/adapter-auth';

import {
  CommunityNotificationCategories,
  ContentItemTitles,
  ContentService,
  contentJobs,
} from '@headless-lms/core/content';
import {
  EntitlementsServiceImpl,
  entitlementsJobs,
  entitlementsRecurringJobs,
} from '@headless-lms/core/entitlements';
import { ProgressServiceImpl } from '@headless-lms/core/progress';
import {
  type ChatHub,
  type ChatHubOptions,
  ChatLiveForwarder,
  ChatServiceImpl,
  DigestServiceImpl,
  DiscussionItemTitles,
  DiscussionServiceImpl,
  type AuthorPermissionReader,
  PostServiceImpl,
  SubscriptionServiceImpl,
  discussionJobs,
  discussionRecurringJobs,
} from '@headless-lms/core/discussion';
import {
  DevicesServiceImpl,
  IdentityServiceImpl,
  NotificationSettingsServiceImpl,
  type SessionAdmin,
} from '@headless-lms/core/identity';
import {
  type ApiKeys,
  type GrantReader,
  type OrgAdmin,
  NotificationCatalog,
  OrganizationServiceImpl,
  OrgNotificationCategories,
  type RoleDefinition,
} from '@headless-lms/core/organizations';
import {
  AssetsServiceImpl,
  assetsJobs,
  assetsRecurringJobs,
  createFileUrls,
} from '@headless-lms/core/assets';
import { IntegrationsServiceImpl } from '@headless-lms/core/integrations';
import {
  AutomationsServiceImpl,
  DEFAULT_COMMUNITY_CATEGORIES,
  DEFAULT_ORG_CATEGORIES,
  NOTIFICATION_TYPES,
  NotificationDelivery,
  NotificationProcessor,
  NotificationsServiceImpl,
  RECIPIENT_RULES,
  SchedulerChatDebounce,
  notificationJobs,
  type NotificationCategories,
} from '@headless-lms/core/automations';
import { buildNotificationRegistries, configuredPushSender } from './notification-channels.js';
import { loadIntegrations } from './integrations.js';
import { mcpEndpoints, type McpEndpoints } from './mcp-endpoints.js';
import { communityMail } from './community-mail.js';
import { notificationReads } from './notification-reads.js';
import { AdminReportServiceImpl } from '@headless-lms/core/reporting/admin';
import { MemberReportServiceImpl } from '@headless-lms/core/reporting/member';
import { Mailer, type MailerLookups } from '@headless-lms/core/shared/mailer';
import { SettingsService } from '@headless-lms/core/shared/settings';
import { platformKeyCheck, type PlatformConfig, type PlatformKeyCheck } from './platform.js';

import type {
  BodyParser,
  ChannelRegistry,
  CredentialStore,
  EmailSender,
  EventBus,
  Logger,
  NotificationChannel,
  NotificationTypeRegistry,
  ObjectStorage,
  OutboxRelay,
  PubSub,
  PushSender,
  Scheduler,
  TemplateContext,
  TemplateRenderer,
} from '@headless-lms/core/shared/ports';
import type { AutomationEngine, PushConfig, WebhookSender } from '@headless-lms/core/types';

/** Installation-supplied ports; an absent slot falls back to a fail-loudly stub. */
export interface AdapterOverrides {
  email?: EmailSender;
  storage?: ObjectStorage;
  /** Resolves email templates to rendered content. Absent → fail-loudly stub. */
  templates?: TemplateRenderer;
  /** Durable automation engine, or a factory given the automations logger. Absent → InlineAutomationEngine (in-process, one attempt per action). */
  workflows?: (AutomationEngine & Scheduler) | ((logger: Logger) => AutomationEngine & Scheduler);
  /** Outbound HTTP for webhook deliveries. Absent → FetchWebhookSender (public addresses only, 10s timeout). */
  webhooks?: WebhookSender;
  /** Notification channels beyond in-app, email and push; each key must be new. */
  notificationChannels?: NotificationChannel[];
  /** Push credentials per provider. Absent → no provider is configured and devices cannot register. */
  push?: PushConfig;
  pushSender?: PushSender;
  /** Reads post bodies: their text, mentions and images. Absent → PlainBodyParser (plain text, no images). */
  bodyParser?: BodyParser;
  /** Delivery to every API instance, or a factory given its logger. Absent → no live chat; the chat stream answers 503. */
  pubsub?: PubSub | ((logger: Logger) => PubSub);
  /** Delivers outbox events to their subscribers, or a factory given its logger. Absent → InMemoryEventBus (same process). */
  eventBus?: EventBus | ((logger: Logger) => EventBus);
}

export interface BuildContainerOptions {
  /** Installation's plugins folder, scanned by loadIntegrations. Absent → no integrations. */
  pluginsDir?: string;
  adapters?: AdapterOverrides;
  roles?: readonly RoleDefinition[];
  /** Live chat hub timings. Absent → the defaults (1 s state flush, 30 s session check). */
  live?: ChatHubOptions;
}

export interface Config {
  databaseUrl: string;
  databasePool?: DatabasePoolOptions;
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
  /** Window of the signed file links a response carries, seconds. Mirrors
   *  ServerConfig.deliveryWindowSeconds — createContainer threads it through. */
  deliveryWindowSeconds: number;
  memberImageMaxBytes: number;
  memberFileMaxBytes: number;
  /** Let the default webhook sender reach loopback and private network addresses. Local development only. */
  webhookAllowPrivateNetwork?: boolean;
  platform?: PlatformConfig;
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
  concurrency?: number;
}

export const OUTBOX_DEFAULTS: PollingOutboxRelayConfig = {
  enabled: true,
  pollIntervalMs: 1000,
  batchSize: 100,
  concurrency: 16,
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
  mcp: McpEndpoints;
  platform: PlatformKeyCheck | null;
  // Org Provider
  orgProvider: OrgAdmin;

  // Domains
  identity: IdentityServiceImpl;
  organizations: OrganizationServiceImpl;
  content: ContentService;
  entitlements: EntitlementsServiceImpl;
  progress: ProgressServiceImpl;
  discussion: DiscussionServiceImpl;
  posts: PostServiceImpl;
  chats: ChatServiceImpl;
  subscriptions: SubscriptionServiceImpl;
  assets: AssetsServiceImpl;
  integrations: IntegrationsServiceImpl;
  automations: AutomationsServiceImpl;
  notificationTypes: NotificationTypeRegistry;
  notificationChannels: ChannelRegistry;
  notificationCategories: {
    community: CommunityNotificationCategories;
    org: OrgNotificationCategories;
  };
  notificationCatalog: NotificationCatalog;
  notificationCategoryLists: NotificationCategories;
  notificationSettings: NotificationSettingsServiceImpl;
  devices: DevicesServiceImpl;
  notificationList: NotificationsServiceImpl;
  /** Cross-cutting settings store. Not a context — a leaf every context may use;
   *  inject `settings.for('<namespace>')` into a service, never the service itself. */
  settings: SettingsService;
  // Reporting read layer (composed cross-context reads; owns no domain rules).
  reporting: {
    admin: AdminReportServiceImpl;
    member: MemberReportServiceImpl;
  };
  storage: ObjectStorage;
  mailer: Mailer;
  /** Shared secure credential store — encrypted at rest, org-scoped, decrypt at point of use. */
  credentials: CredentialStore;
  /** The outbox relay — constructed but NEVER started by the container; the
   *  installation's entry point starts it after listen (gen-openapi must not
   *  poll). buildServer stops it onClose. */
  outboxRelay: OutboxRelay;
  /** The event bus the outbox relay publishes to, with the core subscribers attached. */
  eventBus: EventBus;
  /** The automation engine — constructed but NEVER started by the container;
   *  the installation's entry point starts it after listen (gen-openapi must
   *  not run a worker). buildServer stops it onClose. */
  automationEngine: AutomationEngine;
  scheduler: Scheduler;
  /** The PubSub adapter — constructed but NEVER started by the container; the
   *  installation's entry point starts it after listen. buildServer stops it
   *  onClose. Null without one. */
  pubsub: PubSub | null;
  /** This process's live chat hub; started by the entry point after `pubsub`,
   *  closed by buildServer preClose. Null without a PubSub. */
  chatHub: ChatHub | null;
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
  const db = createDb(config.databaseUrl, logger.child({ name: 'db' }), config.databasePool);
  const email = options?.adapters?.email ?? new EmailAdapter(logger.child({ name: 'email' }));
  const storage: ObjectStorage =
    options?.adapters?.storage ?? new StorageAdapter(logger.child({ name: 'storage' }));
  const templates =
    options?.adapters?.templates ?? new StubTemplateRenderer(logger.child({ name: 'email' }));
  const bodies = options?.adapters?.bodyParser ?? new PlainBodyParser();
  const workflows = options?.adapters?.workflows;
  const automationEngine: AutomationEngine & Scheduler =
    typeof workflows === 'function'
      ? workflows(automationsLogger)
      : (workflows ?? new InlineAutomationEngine(automationsLogger));
  const pubsubOption = options?.adapters?.pubsub;
  const pubsub: PubSub | null =
    typeof pubsubOption === 'function'
      ? pubsubOption(logger.child({ name: 'pubsub' }))
      : (pubsubOption ?? null);
  const mailer = new Mailer(templates, email, {
    ...(config.emailBranding ?? { brandName: 'Headless LMS', baseUrl: config.adminAppUrl }),
    studentPortalUrl: config.studentPortalUrl,
  });

  const fileUrls = createFileUrls((key) => storage.publicUrl(key));
  const assets = new AssetsServiceImpl({
    storage,
    repo: new DrizzleAssetsRepository(db, assetsLogger),
    uow: new DrizzleUnitOfWork(db, (tx) => ({
      assets: new DrizzleAssetsRepository(tx, assetsLogger),
      outbox: new DrizzleOutboxAppender(tx, outboxLogger),
    })),
    memberImageMaxBytes: config.memberImageMaxBytes,
    memberFileMaxBytes: config.memberFileMaxBytes,
    linkWindowSeconds: config.deliveryWindowSeconds,
    logger: assetsLogger,
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
    images: assets,
    fileUrls,
  });

  /*
   * Organization
   */
  const organizationsRepo = new DrizzleOrganizationsRepository(db, logger.child({ name: 'org' }));
  const organizationsUow = new DrizzleUnitOfWork(db, (tx) => ({
    organizations: new DrizzleOrganizationsRepository(tx, logger.child({ name: 'org' })),
    roles: new DrizzleRolesRepository(tx),
    outbox: new DrizzleOutboxAppender(tx, logger.child({ name: 'org' })),
  }));
  const orgAdminRef: { current: BetterAuth | undefined } = { current: undefined };
  const platform = config.platform ? platformKeyCheck(config.platform) : null;
  const organizations: OrganizationServiceImpl = new OrganizationServiceImpl({
    repo: organizationsRepo,
    roles: new DrizzleRolesRepository(db),
    ...(options?.roles && { defaultRoles: options.roles }),
    apiKeys: (): ApiKeys => {
      if (!orgAdminRef.current) {
        throw new Error('api keys not initialised');
      }
      return orgAdminRef.current;
    },
    accounts: () => {
      if (!orgAdminRef.current) {
        throw new Error('accounts not initialised');
      }
      return orgAdminRef.current;
    },
    ...(config.platform && {
      platform: {
        email: config.platform.accountEmail,
        name: config.platform.accountName ?? 'Platform',
      },
    }),
    membersRepo: new DrizzleMembersRepository(db, logger.child({ name: 'org' })),
    people: identity,
    images: assets,
    uow: organizationsUow,
    orgAdmin: () => {
      if (!orgAdminRef.current) {
        throw new Error('orgAdmin not initialised');
      }
      return orgAdminRef.current;
    },
    sessions: () => {
      if (!orgAdminRef.current) {
        throw new Error('sessions not initialised');
      }
      return orgAdminRef.current;
    },
    logger: logger.child({ name: 'org' }),
    mailer,
    inviteUrls: { studentPortalUrl: config.studentPortalUrl, adminAppUrl: config.adminAppUrl },
    grants: (): GrantReader => entitlements,
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
    libraryAssets: assets,
    files: assets,
    fileUrls,
    scheduler: automationEngine,
    logger: contentLogger,
  });
  const pushConfig = options?.adapters?.push ?? {};
  const pushSender = configuredPushSender(pushConfig, options?.adapters?.pushSender);
  const notificationRegistries = buildNotificationRegistries({
    declarations: NOTIFICATION_TYPES,
    defaults: { community: DEFAULT_COMMUNITY_CATEGORIES, org: DEFAULT_ORG_CATEGORIES },
    mailer: options?.adapters?.email ? mailer : null,
    emailOf: async (_orgId, userId) => (await identity.getUserById(userId))?.email ?? null,
    push: pushSender
      ? {
          sender: pushSender,
          activeDevices: (orgId, userId, since) => devices.activeDevices(orgId, userId, since),
        }
      : null,
    channels: options?.adapters?.notificationChannels ?? [],
  });
  const notificationCategories = {
    community: new CommunityNotificationCategories({
      communities: new DrizzleContentRepository(db, contentLogger),
      settings,
      types: notificationRegistries.types,
      channels: notificationRegistries.channels,
      logger: contentLogger,
    }),
    org: new OrgNotificationCategories({
      settings,
      types: notificationRegistries.types,
      channels: notificationRegistries.channels,
      logger: logger.child({ name: 'org' }),
    }),
  };
  const notificationCatalog = new NotificationCatalog({
    types: notificationRegistries.types,
    channels: notificationRegistries.channels,
  });
  const notificationCategoryLists: NotificationCategories = {
    listFor: async (orgId, communityId) =>
      (communityId
        ? await notificationCategories.community.get(communityId, organizations.systemActor(orgId))
        : await notificationCategories.org.get(orgId, organizations.systemActor(orgId))
      ).categories,
  };
  // Entitlements: reads on the root db; writes + outbox append in one tx.
  const entitlementsUow = new DrizzleUnitOfWork(db, (tx) => ({
    entitlements: new DrizzleEntitlementsRepository(tx, entitlementsLogger),
    spaces: new DrizzleContentRepository(tx, contentLogger),
    outbox: new DrizzleOutboxAppender(tx, outboxLogger),
  }));
  const authors: AuthorPermissionReader = organizations;
  const entitlementsRepo = new DrizzleEntitlementsRepository(db, entitlementsLogger);
  const entitlements = new EntitlementsServiceImpl({
    repo: entitlementsRepo,
    content,
    permissions: organizations,
    uow: entitlementsUow,
    logger: entitlementsLogger,
  });
  const identityLogger = logger.child({ name: 'identity' });
  const notificationSettings = new NotificationSettingsServiceImpl({
    repo: new DrizzleNotificationSettingsRepository(db, identityLogger),
    categories: {
      communityList: async (orgId, communityId) =>
        (await notificationCategories.community.get(communityId, organizations.systemActor(orgId)))
          .categories,
      orgList: async (orgId) =>
        (await notificationCategories.org.get(orgId, organizations.systemActor(orgId))).categories,
    },
    access: {
      canOpen: (orgId, actor, communityId) => entitlements.isCommunityMember(communityId, actor),
    },
    channels: notificationRegistries.channels,
    logger: identityLogger,
  });
  const devices = new DevicesServiceImpl({
    repo: new DrizzleDevicesRepository(db, identityLogger),
    push: pushConfig,
    logger: identityLogger,
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
    access: entitlements,
    system: organizations,
    uow: progressUow,
    logger: progressLogger,
  });

  const postReads = new DrizzlePostRepository(db, discussionLogger);
  const discussionReads = new DrizzleDiscussionRepository(db, discussionLogger);
  const chatReads = new DrizzleChatRepository(db, discussionLogger);
  const subscriptionReads = new DrizzleSubscriptionsRepository(db, discussionLogger);
  const mentionReads = new DrizzleMentionsRepository(db, discussionLogger);
  const posts = new PostServiceImpl({
    repo: postReads,
    access: entitlements,
    content,
    authors,
    profiles: discussionReads,
    comments: discussionReads,
    subscriptions: subscriptionReads,
    mentions: mentionReads,
    images: assets,
    fileUrls,
    bodies,
    uow: new DrizzleUnitOfWork(db, (tx) => ({
      posts: new DrizzlePostRepository(tx, discussionLogger),
      mentions: new DrizzleMentionsRepository(tx, discussionLogger),
      outbox: new DrizzleOutboxAppender(tx, outboxLogger),
    })),
    scheduler: automationEngine,
    logger: discussionLogger,
  });
  const chats = new ChatServiceImpl({
    repo: chatReads,
    access: entitlements,
    content,
    authors,
    profiles: discussionReads,
    subscriptions: subscriptionReads,
    mentions: mentionReads,
    images: assets,
    fileUrls,
    uow: new DrizzleUnitOfWork(db, (tx) => ({
      chats: new DrizzleChatRepository(tx, discussionLogger),
      mentions: new DrizzleMentionsRepository(tx, discussionLogger),
      outbox: new DrizzleOutboxAppender(tx, outboxLogger),
    })),
    ...(pubsub && { pubsub }),
    ...(options?.live && { live: options.live }),
    logger: discussionLogger,
  });
  const discussion = new DiscussionServiceImpl({
    repo: discussionReads,
    access: entitlements,
    content: content,
    posts,
    spaces: entitlements,
    authors,
    mentions: mentionReads,
    fileUrls,
    uow: new DrizzleUnitOfWork(db, (tx) => ({
      discussion: new DrizzleDiscussionRepository(tx, discussionLogger),
      mentions: new DrizzleMentionsRepository(tx, discussionLogger),
      outbox: new DrizzleOutboxAppender(tx, outboxLogger),
    })),
    settings,
    logger: discussionLogger,
  });

  const subscriptions = new SubscriptionServiceImpl({
    repo: subscriptionReads,
    access: entitlements,
    posts,
    chats,
    uow: new DrizzleUnitOfWork(db, (tx) => ({
      subscriptions: new DrizzleSubscriptionsRepository(tx, discussionLogger),
      outbox: new DrizzleOutboxAppender(tx, outboxLogger),
    })),
    logger: discussionLogger,
  });

  const digests = new DigestServiceImpl({
    schedules: { communitiesWithDigest: () => content.communitiesWithDigest() },
    runs: new DrizzleDigestRunRepository(db, discussionLogger),
    uow: new DrizzleUnitOfWork(db, (tx) => ({
      digests: new DrizzleDigestRunRepository(tx, discussionLogger),
      outbox: new DrizzleOutboxAppender(tx, outboxLogger),
    })),
    logger: discussionLogger,
  });

  const notificationsRepo = new DrizzleNotificationsRepository(db);
  const notificationList = new NotificationsServiceImpl({
    repo: notificationsRepo,
    logger: automationsLogger,
  });
  const itemTitles = {
    discussion: new DiscussionItemTitles({
      posts,
      chats,
      comments: discussionReads,
      messages: chatReads,
      profiles: discussionReads,
      activities: content,
      access: entitlements,
      actors: organizations,
    }),
    content: new ContentItemTitles({ content, access: entitlements, organizations }),
  };

  const reporting = {
    admin: new AdminReportServiceImpl({
      repo: new DrizzleAdminRepository(db, reportingLogger),
      permissions: organizations,
      spaces: entitlements,
      events: content,
      fileUrls,
    }),
    member: new MemberReportServiceImpl({
      repo: new DrizzleMemberRepository(db, reportingLogger),
      content,
      progress,
      fileUrls,
      access: entitlements,
      people: organizations,
      notifications: notificationList,
      titles: itemTitles,
      subscriptions,
      notificationCategories,
      notificationSettings,
      channels: notificationRegistries.channels,
      studentPortalUrl: config.studentPortalUrl,
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
    credentials: new DrizzleCredentialStore(tx, config.credentialStoreKey, automationsLogger),
    outbox: new DrizzleOutboxAppender(tx, automationsLogger),
  }));
  // Emails triggered by row-shaped events resolve their recipient and content
  // details at send time — the event carries ids only.
  const mailerLookups: MailerLookups = {
    orgUserPerson: async (orgId, orgUserId) => {
      const orgUser = await organizationsRepo.findOrgUserById(orgId, orgUserId);
      const user = orgUser ? await identity.getUserById(orgUser.userId) : null;
      return user ? { userId: user.id, email: user.email } : null;
    },
    contentInfo: async (orgId, contentId) => {
      const system = organizations.systemActor(orgId);
      const course = await content.findCourse(contentId, system);
      if (course) {
        return { id: course.id, title: course.title, type: course.type };
      }
      const download = await content.findDownload(contentId, system);
      if (download) {
        return { id: download.id, title: download.title, type: download.type };
      }
      const community = await content.findCommunity(contentId, system);
      if (community) {
        return { id: community.id, title: community.title, type: community.type };
      }
      const event = await content.findEvent(contentId, system);
      return event ? { id: event.id, title: event.title, type: event.type } : null;
    },
  };

  const runsRepo = new DrizzleAutomationRunsRepository(db, automationsLogger);
  const wired = communityMail({
    content,
    entitlements,
    organizations,
    identity,
    posts,
    subscriptions,
    discussion,
    chats,
    bodies,
  });
  const recipientReads = notificationReads({
    content,
    entitlements,
    organizations,
    identity,
    posts,
    subscriptions,
    discussion,
    chats,
    bodies,
    settings: notificationSettings,
  });
  const notificationProcessor = new NotificationProcessor({
    rules: RECIPIENT_RULES,
    reads: recipientReads,
    types: notificationRegistries.types,
    channels: notificationRegistries.channels,
    categories: notificationCategoryLists,
    settings: notificationSettings,
    devices,
    repo: notificationsRepo,
    engine: automationEngine,
    debounce: new SchedulerChatDebounce(automationEngine),
    logger: automationsLogger,
  });
  const automations = new AutomationsServiceImpl({
    repo: new DrizzleAutomationsRepository(db, automationsLogger),
    runsRepo,
    uow: automationsUow,
    engine: automationEngine,
    mailer,
    lookups: mailerLookups,
    integrations,
    systemActor: (orgId) => organizations.systemActor(orgId),
    credentials: credentialStore,
    webhooks:
      options?.adapters?.webhooks ??
      new FetchWebhookSender({ allowPrivateNetwork: config.webhookAllowPrivateNetwork }),
    mail: wired.mail,
    grants: wired.grants,
    logger: automationsLogger,
  });
  automationEngine.register(automations);
  automationEngine.registerDeliveries(
    new NotificationDelivery({
      repo: notificationsRepo,
      channels: notificationRegistries.channels,
      devices,
      logger: automationsLogger,
    }),
  );
  automationEngine.registerJobs(
    [
      ...discussionJobs({ posts, digests, logger: discussionLogger }),
      ...contentJobs({ events: content, logger: contentLogger }),
      ...entitlementsJobs({ grants: entitlements }),
      ...assetsJobs({ assets, orgs: organizations, logger: assetsLogger }),
      ...notificationJobs({
        processor: notificationProcessor,
        reads: recipientReads,
        logger: automationsLogger,
      }),
    ],
    [...discussionRecurringJobs, ...entitlementsRecurringJobs, ...assetsRecurringJobs],
  );

  const eventBusOption = options?.adapters?.eventBus;
  const eventBus: EventBus =
    typeof eventBusOption === 'function'
      ? eventBusOption(logger.child({ name: 'events' }))
      : (eventBusOption ?? new InMemoryEventBus());
  if (pubsub) {
    new ChatLiveForwarder({ pubsub, logger: discussionLogger }).attach(eventBus);
  }
  eventBus.subscribeAll((event) => automations.handle(event));
  eventBus.subscribeAll((event) => notificationProcessor.process(event));
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
  const mcp = mcpEndpoints(config);
  if (!mcp.oauthEnabled) {
    authLogger.warn(
      'MCP OAuth is off: BETTER_AUTH_URL must be https or a loopback host; /mcp accepts API keys only',
      { authBaseURL: config.authBaseURL },
    );
  }
  const auth: BetterAuth = new BetterAuth({
    db,
    baseUrl: config.authBaseURL,
    mcp: {
      oauthEnabled: mcp.oauthEnabled,
      resource: mcp.resource,
      loginPage: mcp.loginPage,
      consentPage: mcp.consentPage,
      orgPickerPage: mcp.orgPickerPage,
    },
    secret: config.authSecret,
    trustedOrigins: config.trustedOrigins,
    hooks: {
      sendResetPassword: async ({ user, url }) => {
        await identity.sendPasswordReset({ email: user.email, url });
      },
      onPasswordReset: async ({ user }) => {
        await identity.sendPasswordChanged({ email: user.email });
      },
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
        if (organizations.isPlatformAccount(person.email)) {
          authLogger.warn('sign-in refused for the platform account', { userId: person.id });
          return false;
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
          const domainOrg = await organizations.provisionOrganization({
            ownerId: baUser.id,
            ...org,
            logo: org.logo ?? undefined,
          });
          return { data: { ...org, id: domainOrg.id } };
        },
      ),
      beforeDeleteOrganization: authHook('beforeDeleteOrganization', async ({ organization }) => {
        await organizations.deleteOrganization(organization.id);
      }),
      beforeAddMember: authHook('beforeAddMember', async ({ member }) => {
        await organizations.addOrgUser({
          orgId: member.organizationId,
          userId: member.userId,
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
    mcp,
    platform,
    identity,
    organizations,
    // Better Auth owns org writes; the same instance fulfils the OrgAdmin port.
    orgProvider: auth,
    content,
    entitlements,
    progress,
    discussion,
    posts,
    chats,
    subscriptions,
    assets,
    integrations,
    automations,
    notificationTypes: notificationRegistries.types,
    notificationChannels: notificationRegistries.channels,
    notificationCategories,
    notificationCatalog,
    notificationCategoryLists,
    notificationSettings,
    devices,
    notificationList,
    settings,
    reporting,
    storage,
    mailer,
    credentials: credentialStore,
    outboxRelay,
    eventBus,
    automationEngine,
    scheduler: automationEngine,
    pubsub,
    chatHub: chats.hub,
    logger,
    loggerInstance,
    requestContext: requestLogContext,
    // Better Auth owns the session store; the same instance fulfils SessionAdmin.
    sessions: auth,
  };
}
