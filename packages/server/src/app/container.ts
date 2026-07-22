// Wires adapters + services in dependency order. Starts nothing.
import { createDb } from '../adapters/db/index.js';
import { DrizzleUnitOfWork } from '../adapters/db/unit-of-work.js';
import { InMemoryEventBus } from '../adapters/events/index.js';
import {
  PollingOutboxRelay,
  type PollingOutboxRelayConfig,
} from '../adapters/events/outbox-relay.js';
import { DrizzleOutboxAppender, DrizzleOutboxStore } from '../adapters/db/repositories/outbox.js';
import { EmailAdapter } from '../adapters/email/index.js';
import { createRootLogger, type LogLevel, type PinoInstance } from '../adapters/logging/index.js';
import { StorageAdapter } from '../adapters/storage/index.js';
import { createAuth, type Auth } from '../adapters/auth/index.js';
import { createOrgAdmin } from '../adapters/auth/org-admin.js';
import {
  createConnectedAppsRepo,
  type ConnectedAppsRepo,
} from '../adapters/auth/connected-apps.js';

import { ContentServiceImpl } from '../core/content/index.js';
import { EntitlementsServiceImpl } from '../core/entitlements/index.js';
import { ProgressServiceImpl } from '../core/progress/index.js';
import { IdentityServiceImpl } from '../core/identity/index.js';
import { OrganizationServiceImpl, type OrgAdmin } from '../core/organizations/index.js';
import { AssetsServiceImpl } from '../core/assets/index.js';
import { IntegrationsServiceImpl } from '../core/integrations/index.js';
import { loadIntegrations } from './integrations.js';
import { StudentsReportServiceImpl } from '../reporting/students/index.js';
import { DashboardReportServiceImpl } from '../reporting/dashboard/index.js';
import { LearnReportServiceImpl } from '../reporting/learn/index.js';

import { DrizzleEntitlementsRepository } from '../adapters/db/repositories/entitlements.js';
import { DrizzleProgressRepository } from '../adapters/db/repositories/progress.js';
import { DrizzleIdentityRepository } from '../adapters/db/repositories/identity.js';
import { DrizzleOrganizationsRepository } from '../adapters/db/repositories/organizations.js';
import { DrizzleMembersRepository } from '../adapters/db/repositories/members.js';
import { DrizzleContentRepository } from '../adapters/db/repositories/content.js';
import { DrizzleContentStructureRepository } from '../adapters/db/repositories/structure.js';
import { DrizzleAssetsRepository } from '../adapters/db/repositories/assets.js';
import { DrizzleStudentsRepository } from '../adapters/db/repositories/students.js';
import { DrizzleDashboardRepository } from '../adapters/db/repositories/dashboard.js';
import { DrizzleLearnRepository } from '../adapters/db/repositories/learn.js';
import { DrizzleCredentialStore } from '../adapters/db/repositories/credentials.js';
import { DrizzleConnectionsRepository } from '../adapters/db/repositories/integrations.js';
import type {
  CredentialStore,
  EmailSender,
  Logger,
  ObjectStorage,
  OutboxRelay,
} from '../core/shared/ports.js';

/** Installation-supplied ports; an absent slot falls back to a fail-loudly stub. */
export interface AdapterOverrides {
  email?: EmailSender;
  storage?: ObjectStorage;
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
  /** Login page URL shown to unauthenticated MCP OAuth clients. */
  mcpLoginPage: string;
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
  auth: Auth;
  // Domains
  identity: IdentityServiceImpl;
  organizations: OrganizationServiceImpl;
  content: ContentServiceImpl;
  entitlements: EntitlementsServiceImpl;
  progress: ProgressServiceImpl;
  assets: AssetsServiceImpl;
  integrations: IntegrationsServiceImpl;
  // Reporting read layer (composed cross-context reads; owns no domain rules).
  reporting: {
    students: StudentsReportServiceImpl;
    dashboard: DashboardReportServiceImpl;
    learn: LearnReportServiceImpl;
  };
  storage: ObjectStorage;
  connectedApps: ConnectedAppsRepo;
  /** Shared secure credential store — encrypted at rest, org-scoped, decrypt at point of use. */
  credentials: CredentialStore;
  /** The outbox relay — constructed but NEVER started by the container; the
   *  installation's entry point starts it after listen (gen-openapi must not
   *  poll). buildServer stops it onClose. */
  outboxRelay: OutboxRelay;
  /** Root logger port — components receive children bound with { name }. */
  logger: Logger;
  /** The raw pino root; buildServer hands it to Fastify so HTTP shares the stream. */
  loggerInstance: PinoInstance;
}

export async function buildContainer(
  config: Config,
  options?: BuildContainerOptions,
): Promise<Container> {
  const { instance: loggerInstance, logger } = createRootLogger(
    resolveLoggingConfig(config.logging).level,
  );
  // One child per domain — a context's service and repositories share it.
  const identityLogger = logger.child({ name: 'identity' });
  const organizationsLogger = logger.child({ name: 'organizations' });
  const contentLogger = logger.child({ name: 'content' });
  const entitlementsLogger = logger.child({ name: 'entitlements' });
  const progressLogger = logger.child({ name: 'progress' });
  const assetsLogger = logger.child({ name: 'assets' });
  const integrationsLogger = logger.child({ name: 'integrations' });
  const reportingLogger = logger.child({ name: 'reporting' });
  const outboxLogger = logger.child({ name: 'outbox' });

  // Outbound adapters
  const db = createDb(config.databaseUrl);
  const email = options?.adapters?.email ?? new EmailAdapter(logger.child({ name: 'email' }));
  const storage: ObjectStorage =
    options?.adapters?.storage ?? new StorageAdapter(logger.child({ name: 'storage' }));

  // OrgAdmin (member writes via Better Auth) cannot exist until auth is built,
  // and auth depends on the organizations service. Provide it lazily via a ref
  // that composition fills in once auth exists.
  const orgAdminRef: { current: OrgAdmin | undefined } = { current: undefined };
  const orgAdminProvider = (): OrgAdmin => {
    if (!orgAdminRef.current) {
      throw new Error('orgAdmin not initialised');
    }
    return orgAdminRef.current;
  };

  // Services (inject repos + peer services in dependency order)
  const identity = new IdentityServiceImpl(
    new DrizzleIdentityRepository(db, identityLogger),
    identityLogger,
  );
  const organizations = new OrganizationServiceImpl(
    new DrizzleOrganizationsRepository(db, organizationsLogger),
    new DrizzleMembersRepository(db, organizationsLogger),
    orgAdminProvider,
    organizationsLogger,
  );
  // Content: reads on the root db; course writes + outbox append in one tx.
  const contentUow = new DrizzleUnitOfWork(db, (tx) => ({
    courses: new DrizzleContentRepository(tx, contentLogger),
    outbox: new DrizzleOutboxAppender(tx, outboxLogger),
  }));
  const content = new ContentServiceImpl(
    new DrizzleContentRepository(db, contentLogger),
    new DrizzleContentStructureRepository(db, contentLogger),
    contentUow,
    contentLogger,
  );
  // Entitlements: reads on the root db; writes + outbox append in one tx.
  const entitlementsUow = new DrizzleUnitOfWork(db, (tx) => ({
    entitlements: new DrizzleEntitlementsRepository(tx, entitlementsLogger),
    outbox: new DrizzleOutboxAppender(tx, outboxLogger),
  }));
  const entitlements = new EntitlementsServiceImpl(
    new DrizzleEntitlementsRepository(db, entitlementsLogger),
    entitlementsUow,
    entitlementsLogger,
  );
  const progress = new ProgressServiceImpl(
    new DrizzleProgressRepository(db, progressLogger),
    () => new Date().toISOString(),
    progressLogger,
  );
  const assets = new AssetsServiceImpl(
    storage,
    new DrizzleAssetsRepository(db, assetsLogger),
    () => new Date().toISOString(),
    assetsLogger,
  );

  const reporting = {
    students: new StudentsReportServiceImpl(
      new DrizzleStudentsRepository(db, reportingLogger),
      reportingLogger,
    ),
    dashboard: new DashboardReportServiceImpl(
      new DrizzleDashboardRepository(db, reportingLogger),
      reportingLogger,
    ),
    learn: new LearnReportServiceImpl(
      new DrizzleLearnRepository(db, reportingLogger),
      content,
      reportingLogger,
    ),
  };

  const connectedApps = createConnectedAppsRepo(db);
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
  const integrations = new IntegrationsServiceImpl(
    integrationsRegistry,
    new DrizzleConnectionsRepository(db, integrationsLogger),
    integrationsUow,
    () => new Date().toISOString(),
    integrationsLogger,
  );

  const eventBus = new InMemoryEventBus();
  const outboxConfig = resolveOutboxConfig(config.outbox);
  const outboxRelay = new PollingOutboxRelay(
    new DrizzleOutboxStore(db, outboxLogger),
    eventBus,
    outboxConfig,
    outboxLogger,
  );

  // Auth adapter — depends on core ports (email, identity, organizations);
  // composition only injects the implementations.
  const auth = createAuth({
    db,
    baseURL: config.authBaseURL,
    secret: config.authSecret,
    trustedOrigins: config.trustedOrigins,
    mcpLoginPage: config.mcpLoginPage,
    email,
    identity,
    organizations,
    logger: logger.child({ name: 'auth' }),
    cookieDomain: config.cookieDomain,
    secureCookies: config.secureCookies,
    studentPortalUrl: config.studentPortalUrl,
    adminAppUrl: config.adminAppUrl,
  });

  // Resolve the lazy OrgAdmin now that auth exists — organizations' member-write
  // operations drive Better Auth through it.
  orgAdminRef.current = createOrgAdmin(auth);

  return {
    auth,
    identity,
    organizations,
    content,
    entitlements,
    progress,
    assets,
    integrations,
    reporting,
    storage,
    connectedApps,
    credentials: credentialStore,
    outboxRelay,
    logger,
    loggerInstance,
  };
}
