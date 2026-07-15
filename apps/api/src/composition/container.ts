// Wires adapters + services in dependency order. Starts nothing.
import { createDb } from "../adapters/db/index.js";
import { InMemoryEventBus } from "../adapters/events/index.js";
import { EmailAdapter } from "../adapters/email/index.js";
import { MinioStorageAdapter, type MinioStorageConfig } from "../adapters/storage/index.js";
import { createAuth, type Auth } from "../adapters/auth/index.js";
import { createOrgAdmin } from "../adapters/auth/org-admin.js";
import {
  createConnectedAppsRepo,
  type ConnectedAppsRepo,
} from "../adapters/auth/connected-apps.js";

import { ContentServiceImpl } from "../core/content/index.js";
import { EntitlementsServiceImpl } from "../core/entitlements/index.js";
import { ProgressServiceImpl } from "../core/progress/index.js";
import { IdentityServiceImpl } from "../core/identity/index.js";
import { OrganizationServiceImpl, type OrgAdmin } from "../core/organizations/index.js";
import { AssetsServiceImpl } from "../core/assets/index.js";
import {
  IntegrationsServiceImpl,
  createIntegrationsRegistry,
  stripe,
  slack,
} from "../core/integrations/index.js";
import { StudentsReportServiceImpl } from "../reporting/students/index.js";
import { DashboardReportServiceImpl } from "../reporting/dashboard/index.js";

import { DrizzleEntitlementsRepository } from "../adapters/db/repositories/entitlements.js";
import { DrizzleProgressRepository } from "../adapters/db/repositories/progress.js";
import { DrizzleIdentityRepository } from "../adapters/db/repositories/identity.js";
import { DrizzleOrganizationsRepository } from "../adapters/db/repositories/organizations.js";
import { DrizzleMembersRepository } from "../adapters/db/repositories/members.js";
import { DrizzleContentRepository } from "../adapters/db/repositories/content.js";
import { DrizzleContentStructureRepository } from "../adapters/db/repositories/structure.js";
import { DrizzleAssetsRepository } from "../adapters/db/repositories/assets.js";
import { DrizzleStudentsRepository } from "../adapters/db/repositories/students.js";
import { DrizzleDashboardRepository } from "../adapters/db/repositories/dashboard.js";
import { DrizzleCredentialStore } from "../adapters/db/repositories/credentials.js";
import { DrizzleConnectionsRepository } from "../adapters/db/repositories/integrations.js";
import type { CredentialStore } from "../core/shared/ports.js";

export interface Config {
  databaseUrl: string;
  authBaseURL: string;
  authSecret: string;
  trustedOrigins: string[];
  /** Login page URL shown to unauthenticated MCP OAuth clients. */
  mcpLoginPage: string;
  storage: MinioStorageConfig;
  /** base64-encoded 32-byte key for the credential store (CREDENTIAL_STORE_KEY). */
  credentialStoreKey: string;
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
  };
  storage: MinioStorageAdapter;
  connectedApps: ConnectedAppsRepo;
  /** Shared secure credential store — encrypted at rest, org-scoped, decrypt at point of use. */
  credentials: CredentialStore;
}

export function buildContainer(config: Config): Container {
  // Outbound adapters
  const db = createDb(config.databaseUrl);
  const eventBus = new InMemoryEventBus();
  const email = new EmailAdapter();
  const storage = new MinioStorageAdapter(config.storage);

  // OrgAdmin (member writes via Better Auth) cannot exist until auth is built,
  // and auth depends on the organizations service. Provide it lazily via a ref
  // that composition fills in once auth exists.
  const orgAdminRef: { current: OrgAdmin | undefined } = { current: undefined };
  const orgAdminProvider = (): OrgAdmin => {
    if (!orgAdminRef.current) throw new Error("orgAdmin not initialised");
    return orgAdminRef.current;
  };

  // Services (inject repos + peer services in dependency order)
  const identity = new IdentityServiceImpl(new DrizzleIdentityRepository(db));
  const organizations = new OrganizationServiceImpl(
    new DrizzleOrganizationsRepository(db),
    new DrizzleMembersRepository(db),
    orgAdminProvider,
  );
  const content = new ContentServiceImpl(
    new DrizzleContentRepository(db),
    new DrizzleContentStructureRepository(db),
  );
  const entitlements = new EntitlementsServiceImpl(new DrizzleEntitlementsRepository(db));
  const progress = new ProgressServiceImpl(new DrizzleProgressRepository(db), () =>
    new Date().toISOString(),
  );
  const assets = new AssetsServiceImpl(storage, new DrizzleAssetsRepository(db), () =>
    new Date().toISOString(),
  );

  const reporting = {
    students: new StudentsReportServiceImpl(new DrizzleStudentsRepository(db)),
    dashboard: new DashboardReportServiceImpl(new DrizzleDashboardRepository(db)),
  };

  const connectedApps = createConnectedAppsRepo(db);
  const credentialStore = new DrizzleCredentialStore(db, config.credentialStoreKey);
  // The integrations this deployment supports, declared once at startup.
  // Connect/configure reject anything not in this list and validate config
  // with the integration's own schema.
  const integrationsRegistry = createIntegrationsRegistry([stripe, slack]);
  const integrations = new IntegrationsServiceImpl(
    integrationsRegistry,
    new DrizzleConnectionsRepository(db),
    credentialStore,
    eventBus,
    () => new Date().toISOString(),
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
  };
}
