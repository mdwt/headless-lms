// Wires adapters + services in dependency order. Starts nothing.
import { randomUUID } from "node:crypto";
import { createDb } from "../adapters/db/index.js";
import { InMemoryEventBus } from "../adapters/events/index.js";
import { EmailAdapter } from "../adapters/email/index.js";
import { MinioStorageAdapter, type MinioStorageConfig } from "../adapters/storage/index.js";
import { createAuth, type Auth } from "../adapters/auth/index.js";

import { CoursesServiceImpl } from "../core/courses/index.js";
import { EntitlementsServiceImpl } from "../core/entitlements/index.js";
import { OffersServiceImpl } from "../core/offers/index.js";
import { BillingServiceImpl } from "../core/billing/index.js";
import { ProgressServiceImpl } from "../core/progress/index.js";
import { IdentityServiceImpl } from "../core/identity/index.js";
import { OrganizationServiceImpl } from "../core/organizations/index.js";
import { StudentsServiceImpl } from "../core/students/index.js";
import { EnrollmentsServiceImpl } from "../core/enrollments/index.js";
import { SubmissionsServiceImpl } from "../core/submissions/index.js";
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
import { InMemoryCoursesRepository } from "../adapters/inmemory/courses.js";
import { InMemoryStudentsRepository } from "../adapters/inmemory/students.js";
import { InMemoryEnrollmentsRepository } from "../adapters/inmemory/enrollments.js";
import { InMemorySubmissionsRepository } from "../adapters/inmemory/submissions.js";
import { InMemoryTeamRepository } from "../adapters/inmemory/team.js";
import { InMemoryDashboardRepository } from "../adapters/inmemory/dashboard.js";
import { InMemoryModulesRepository } from "../adapters/inmemory/modules.js";
import { DrizzleAssetsRepository } from "../adapters/db/repositories/assets.js";

export interface Config {
  databaseUrl: string;
  authBaseURL: string;
  authSecret: string;
  trustedOrigins: string[];
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
  // Back-office read/write surfaces (in-memory until their schemas are built out).
  students: StudentsServiceImpl;
  enrollments: EnrollmentsServiceImpl;
  submissions: SubmissionsServiceImpl;
  team: TeamServiceImpl;
  dashboard: DashboardServiceImpl;
  modules: ModulesServiceImpl;
  assets: AssetsServiceImpl;
  storage: MinioStorageAdapter;
}

export function buildContainer(config: Config): Container {
  // Outbound adapters
  const db = createDb(config.databaseUrl);
  const eventBus = new InMemoryEventBus();
  const email = new EmailAdapter();
  const storage = new MinioStorageAdapter(config.storage);
  void eventBus;

  // Repositories
  // Courses are served from memory until the Drizzle schema is built out.
  const coursesRepo = new InMemoryCoursesRepository();
  const entitlementsRepo = new DrizzleEntitlementsRepository();
  const offersRepo = new DrizzleOffersRepository();
  const billingRepo = new DrizzleBillingRepository();
  const progressRepo = new DrizzleProgressRepository();
  const identityRepo = new DrizzleIdentityRepository(db);
  const organizationsRepo = new DrizzleOrganizationsRepository(db);

  // Services (inject repos + peer services in dependency order)
  const identity = new IdentityServiceImpl(identityRepo);
  const organizations = new OrganizationServiceImpl(organizationsRepo);
  const courses = new CoursesServiceImpl(coursesRepo);
  const entitlements = new EntitlementsServiceImpl(entitlementsRepo);
  const offers = new OffersServiceImpl(offersRepo);
  const billing = new BillingServiceImpl(billingRepo);
  const progress = new ProgressServiceImpl(progressRepo);
  const students = new StudentsServiceImpl(new InMemoryStudentsRepository());
  const enrollments = new EnrollmentsServiceImpl(new InMemoryEnrollmentsRepository());
  const submissions = new SubmissionsServiceImpl(new InMemorySubmissionsRepository());
  const team = new TeamServiceImpl(new InMemoryTeamRepository());
  const dashboard = new DashboardServiceImpl(new InMemoryDashboardRepository());
  const modules = new ModulesServiceImpl(new InMemoryModulesRepository());
  const assets = new AssetsServiceImpl(
    storage,
    new DrizzleAssetsRepository(db),
    () => randomUUID(),
    () => new Date().toISOString(),
  );

  // Auth adapter — depends on core ports (email, identity, organizations);
  // composition only injects the implementations.
  const auth = createAuth({
    db,
    baseURL: config.authBaseURL,
    secret: config.authSecret,
    trustedOrigins: config.trustedOrigins,
    email,
    identity,
    organizations,
  });

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
    submissions,
    team,
    dashboard,
    modules,
    assets,
    storage,
  };
}
