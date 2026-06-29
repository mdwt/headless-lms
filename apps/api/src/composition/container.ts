// Wires adapters + services in dependency order. Starts nothing.
import { randomUUID } from "node:crypto";
import { createDb } from "../adapters/db/index.js";
import { InMemoryEventBus } from "../adapters/events/index.js";
import { EmailAdapter } from "../adapters/email/index.js";
import { MinioStorageAdapter, type MinioStorageConfig } from "../adapters/storage/index.js";
import { createAuth, type Auth } from "../adapters/auth/index.js";
import { createOrgAdmin } from "../adapters/auth/org-admin.js";
import { createConnectedAppsRepo, type ConnectedAppsRepo } from "../adapters/auth/connected-apps.js";

import { CoursesServiceImpl } from "../core/courses/index.js";
import { EntitlementsServiceImpl } from "../core/entitlements/index.js";
import { OffersServiceImpl } from "../core/offers/index.js";
import { BillingServiceImpl } from "../core/billing/index.js";
import { ProgressServiceImpl } from "../core/progress/index.js";
import { IdentityServiceImpl } from "../core/identity/index.js";
import { OrganizationServiceImpl } from "../core/organizations/index.js";
import { StudentsServiceImpl } from "../core/students/index.js";
import { EnrollmentsServiceImpl } from "../core/enrollments/index.js";
import { TeamServiceImpl } from "../core/team/index.js";
import { DashboardServiceImpl } from "../core/dashboard/index.js";
import { ModulesServiceImpl } from "../core/modules/index.js";
import { AssetsServiceImpl } from "../core/assets/index.js";

import { DrizzleEntitlementsRepository } from "../adapters/db/repositories/entitlements.js";
import { DrizzleOffersRepository } from "../adapters/db/repositories/offers.js";
import { DrizzleBillingRepository } from "../adapters/db/repositories/billing.js";
import { DrizzleProgressRepository } from "../adapters/db/repositories/progress.js";
import { DrizzleIdentityRepository } from "../adapters/db/repositories/identity.js";
import { DrizzleOrganizationsRepository } from "../adapters/db/repositories/organizations.js";
import { DrizzleCoursesRepository } from "../adapters/db/repositories/courses.js";
import { DrizzleStudentsRepository } from "../adapters/db/repositories/students.js";
import { DrizzleEnrollmentsRepository } from "../adapters/db/repositories/enrollments.js";
import { DrizzleTeamRepository } from "../adapters/db/repositories/team.js";
import { DrizzleDashboardRepository } from "../adapters/db/repositories/dashboard.js";
import { DrizzleModulesRepository } from "../adapters/db/repositories/modules.js";
import { DrizzleAssetsRepository } from "../adapters/db/repositories/assets.js";

export interface Config {
  databaseUrl: string;
  authBaseURL: string;
  authSecret: string;
  trustedOrigins: string[];
  /** Login page URL shown to unauthenticated MCP OAuth clients. */
  mcpLoginPage: string;
  storage: MinioStorageConfig;
}

export interface Container {
  auth: Auth;
  courses: CoursesServiceImpl;
  entitlements: EntitlementsServiceImpl;
  offers: OffersServiceImpl;
  billing: BillingServiceImpl;
  progress: ProgressServiceImpl;
  identity: IdentityServiceImpl;
  organizations: OrganizationServiceImpl;
  // Back-office read/write surfaces — all org-scoped and Postgres-backed.
  students: StudentsServiceImpl;
  enrollments: EnrollmentsServiceImpl;
  team: TeamServiceImpl;
  dashboard: DashboardServiceImpl;
  modules: ModulesServiceImpl;
  assets: AssetsServiceImpl;
  storage: MinioStorageAdapter;
  connectedApps: ConnectedAppsRepo;
}

export function buildContainer(config: Config): Container {
  // Outbound adapters
  const db = createDb(config.databaseUrl);
  const eventBus = new InMemoryEventBus();
  const email = new EmailAdapter();
  const storage = new MinioStorageAdapter(config.storage);
  void eventBus;

  // Repositories (all Postgres-backed)
  const entitlementsRepo = new DrizzleEntitlementsRepository();
  const offersRepo = new DrizzleOffersRepository();
  const billingRepo = new DrizzleBillingRepository();
  const progressRepo = new DrizzleProgressRepository();
  const identityRepo = new DrizzleIdentityRepository(db);
  const organizationsRepo = new DrizzleOrganizationsRepository(db);

  // Services (inject repos + peer services in dependency order)
  const identity = new IdentityServiceImpl(identityRepo);
  const organizations = new OrganizationServiceImpl(organizationsRepo);
  const courses = new CoursesServiceImpl(new DrizzleCoursesRepository(db));
  const entitlements = new EntitlementsServiceImpl(entitlementsRepo);
  const offers = new OffersServiceImpl(offersRepo);
  const billing = new BillingServiceImpl(billingRepo);
  const progress = new ProgressServiceImpl(progressRepo);
  const students = new StudentsServiceImpl(new DrizzleStudentsRepository(db));
  const enrollments = new EnrollmentsServiceImpl(new DrizzleEnrollmentsRepository(db));
  const dashboard = new DashboardServiceImpl(new DrizzleDashboardRepository(db));
  const modules = new ModulesServiceImpl(new DrizzleModulesRepository(db));
  const assets = new AssetsServiceImpl(
    storage,
    new DrizzleAssetsRepository(db),
    () => randomUUID(),
    () => new Date().toISOString(),
  );

  const connectedApps = createConnectedAppsRepo(db);

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

  // team reads from the domain mirror (db) and writes through Better Auth, so it
  // is constructed after auth.
  const team = new TeamServiceImpl(new DrizzleTeamRepository(db), createOrgAdmin(auth));

  return {
    auth,
    courses,
    entitlements,
    offers,
    billing,
    progress,
    identity,
    organizations,
    students,
    enrollments,
    team,
    dashboard,
    modules,
    assets,
    storage,
    connectedApps,
  };
}
