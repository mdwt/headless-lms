/**
 * Seed the database with a random, ID-conforming graph across every domain:
 * organizations → users/memberships, students, courses → modules → activities,
 * assets (+ activity links), enrollments, and progress records.
 *
 * Values come from faker; ids come from `genId` so they carry the real prefixed
 * KSUID shape (`crs_…`, `mod_…`, …). Hand-written because the schema's composite
 * `(org_id, id)` keys and composite FKs are outside drizzle-seed's support. No
 * configuration — every run inserts fresh random data. Run:
 *   pnpm --filter @headless-lms/api seed
 */
import { faker } from '@faker-js/faker';
import { createDb, schema } from './db.js';
import { genId, ksuid } from '../core/shared/id.js';
import { seedDevStudent } from './seed-dev-student.js';

const times = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));
const chance = (p: number) => faker.number.float() < p;
// Random provider suffix keeps every address unique (trailing KSUID bytes are random).
const uEmail = (firstName?: string, lastName?: string) =>
  faker.internet
    .email({ firstName, lastName, provider: `${ksuid().slice(-8)}.example.com` })
    .toLowerCase();

async function main(db: ReturnType<typeof createDb>) {
  const users: (typeof schema.users.$inferInsert)[] = [];
  const students: (typeof schema.students.$inferInsert)[] = [];
  const organizations: (typeof schema.organizations.$inferInsert)[] = [];
  const memberships: (typeof schema.memberships.$inferInsert)[] = [];
  const assets: (typeof schema.assets.$inferInsert)[] = [];
  const courses: (typeof schema.courses.$inferInsert)[] = [];
  const modules: (typeof schema.modules.$inferInsert)[] = [];
  const activities: (typeof schema.activities.$inferInsert)[] = [];
  const activityAssets: (typeof schema.activityAssets.$inferInsert)[] = [];
  const enrollments: (typeof schema.enrollments.$inferInsert)[] = [];
  const progress: (typeof schema.progressRecords.$inferInsert)[] = [];

  times(faker.number.int({ min: 3, max: 6 }), () => {
    // Owner user + org.
    const ownerId = genId('user');
    users.push({
      id: ownerId,
      externalId: ksuid(),
      email: uEmail(),
      displayName: faker.person.fullName(),
    });

    const orgId = genId('organization');
    const orgName = faker.company.name();
    organizations.push({
      id: orgId,
      externalId: ksuid(),
      name: orgName,
      slug: faker.helpers.slugify(orgName).toLowerCase() + '-' + ksuid().slice(-6),
      ownerId,
    });
    memberships.push({
      orgId,
      id: genId('membership'),
      userId: ownerId,
      role: 'owner',
      externalId: ksuid(),
    });

    // Staff.
    times(faker.number.int({ min: 2, max: 4 }), () => {
      const uid = genId('user');
      users.push({
        id: uid,
        externalId: ksuid(),
        email: uEmail(),
        displayName: faker.person.fullName(),
      });
      memberships.push({
        orgId,
        id: genId('membership'),
        userId: uid,
        role: faker.helpers.arrayElement(['admin', 'instructor'] as const),
        externalId: ksuid(),
      });
    });

    // Students (org-scoped: each belongs to this org).
    const orgStudents = times(faker.number.int({ min: 5, max: 12 }), () => {
      const sid = genId('student');
      const first = faker.person.firstName();
      const last = faker.person.lastName();
      students.push({
        orgId,
        id: sid,
        externalId: ksuid(),
        email: uEmail(first, last),
        firstName: first,
        lastName: last,
      });
      return sid;
    });

    // Assets.
    const orgAssets = times(faker.number.int({ min: 4, max: 8 }), () => {
      const id = genId('asset');
      assets.push({
        orgId,
        id,
        key: `${orgId}/${ksuid()}`,
        kind: faker.helpers.arrayElement(['video', 'download', 'content'] as const),
        filename: faker.system.commonFileName(),
        contentType: faker.system.mimeType(),
        size: faker.number.int({ min: 1_000, max: 500_000_000 }),
        status: 'ready',
        uploadedBy: ownerId,
      });
      return id;
    });

    // Courses → modules → activities, with asset links.
    times(faker.number.int({ min: 2, max: 5 }), () => {
      const courseId = genId('course');
      const title = faker.helpers.arrayElement([
        faker.company.catchPhrase(),
        faker.commerce.productName(),
        faker.hacker.phrase(),
      ]);
      courses.push({
        orgId,
        id: courseId,
        title,
        slug: faker.helpers.slugify(title).toLowerCase() + '-' + ksuid().slice(-6),
        description: faker.lorem.paragraph(),
        status: faker.helpers.arrayElement(['draft', 'published'] as const),
        category: faker.helpers.arrayElement([
          'Art',
          'Design',
          'Music',
          'Craft',
          'Science',
          'Technology',
        ]),
      });

      const courseModules = times(faker.number.int({ min: 2, max: 5 }), (m) => {
        const moduleId = genId('module');
        modules.push({ orgId, id: moduleId, courseId, title: faker.commerce.department(), seq: m });
        times(faker.number.int({ min: 2, max: 6 }), (a) => {
          const activityId = genId('activity');
          activities.push({
            orgId,
            id: activityId,
            moduleId,
            seq: a,
            settings: {
              title: faker.lorem.sentence(3),
              type: faker.helpers.arrayElement(['lesson', 'assessment']),
            },
          });
          if (chance(0.5)) {
            activityAssets.push({
              orgId,
              id: genId('activityAsset'),
              activityId,
              assetId: faker.helpers.arrayElement(orgAssets),
              seq: 0,
            });
          }
        });
        return moduleId;
      });

      // Enrollments + progress for a random subset of students.
      for (const studentId of orgStudents) {
        if (chance(0.4)) {
          continue;
        }
        enrollments.push({
          orgId,
          id: genId('enrollment'),
          studentId,
          courseId,
          status: faker.helpers.arrayElement(['active', 'revoked'] as const),
          source: faker.helpers.arrayElement(['manual', 'import'] as const),
          expiresAt: chance(0.3) ? faker.date.future() : null,
        });
        const targetType = faker.helpers.arrayElement([
          'lesson',
          'assessment',
          'module',
          'course',
        ] as const);
        progress.push({
          orgId,
          id: genId('progress'),
          studentId,
          targetType,
          targetId:
            targetType === 'course'
              ? courseId
              : targetType === 'module'
                ? faker.helpers.arrayElement(courseModules)
                : genId('activity'),
          completedAt: chance(0.5) ? faker.date.recent() : null,
        });
      }
    });
  });

  // Insert respecting FK order — all-or-nothing so a failure leaves no partial data.
  await db.transaction(async (tx) => {
    await tx.insert(schema.users).values(users);
    await tx.insert(schema.organizations).values(organizations);
    await tx.insert(schema.students).values(students);
    await tx.insert(schema.memberships).values(memberships);
    await tx.insert(schema.assets).values(assets);
    await tx.insert(schema.courses).values(courses);
    await tx.insert(schema.modules).values(modules);
    await tx.insert(schema.activities).values(activities);
    await tx.insert(schema.activityAssets).values(activityAssets);
    await tx.insert(schema.enrollments).values(enrollments);
    await tx.insert(schema.progressRecords).values(progress);
  });

  console.log(
    `Seeded ${organizations.length} orgs, ${users.length} users, ${students.length} students, ` +
      `${courses.length} courses, ${modules.length} modules, ${activities.length} activities, ` +
      `${assets.length} assets, ${enrollments.length} enrollments, ${progress.length} progress records.`,
  );
}

export async function runSeed(databaseUrl: string): Promise<void> {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Put it in your .env and re-run.');
  }
  const db = createDb(databaseUrl);
  try {
    await main(db);
    await seedDevStudent(db);
  } finally {
    await db.$client.end();
  }
}

export { runSeedDevStudent } from './seed-dev-student.js';
