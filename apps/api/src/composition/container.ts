// Wires adapters + services in dependency order. Starts nothing.
import { createDb } from "../adapters/db/index.js";
import { InMemoryEventBus } from "../adapters/events/index.js";
import { EmailAdapter } from "../adapters/email/index.js";
import { createAuth, type Auth } from "../adapters/auth/index.js";

import { CoursesServiceImpl } from "../core/courses/index.js";
import { EntitlementsServiceImpl } from "../core/entitlements/index.js";
import { OffersServiceImpl } from "../core/offers/index.js";
import { BillingServiceImpl } from "../core/billing/index.js";
import { ProgressServiceImpl } from "../core/progress/index.js";
import { IdentityServiceImpl } from "../core/identity/index.js";
import { OrganizationServiceImpl } from "../core/organizations/index.js";

import { DrizzleCoursesRepository } from "../adapters/db/repositories/courses.js";
import { DrizzleEntitlementsRepository } from "../adapters/db/repositories/entitlements.js";
import { DrizzleOffersRepository } from "../adapters/db/repositories/offers.js";
import { DrizzleBillingRepository } from "../adapters/db/repositories/billing.js";
import { DrizzleProgressRepository } from "../adapters/db/repositories/progress.js";
import { DrizzleIdentityRepository } from "../adapters/db/repositories/identity.js";
import { DrizzleOrganizationsRepository } from "../adapters/db/repositories/organizations.js";

export interface Config {
  databaseUrl: string;
  authBaseURL: string;
  authSecret: string;
  trustedOrigins: string[];
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
}

export function buildContainer(config: Config): Container {
  // Outbound adapters
  const db = createDb(config.databaseUrl);
  const eventBus = new InMemoryEventBus();
  const email = new EmailAdapter();
  void eventBus;

  // Repositories
  const coursesRepo = new DrizzleCoursesRepository();
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

  return { auth, courses, entitlements, offers, billing, progress, identity, organizations };
}
