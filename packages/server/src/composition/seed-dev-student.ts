/**
 * Seeds ONE deterministic, loginable student for dev/demo:
 *   email `student@example.com` / password `password123`.
 * Idempotent (fixed ids + onConflictDoNothing) so it can run repeatedly and
 * against an already-seeded DB without disturbing existing data. Wires the full
 * chain the Learn API needs: better-auth user+credential account → domain
 * student (externalId = the auth user id) → a PUBLISHED course whose activities
 * carry real Plate `settings.content` → an active entitlement.
 */
import { hashPassword } from 'better-auth/crypto';
import { createDb, schema } from './db.js';
import { user, account } from '../adapters/auth/schema.js';

const AUTH_USER_ID = 'usr_dev_student';
const STUDENT_EMAIL = 'student@example.com';
const STUDENT_PASSWORD = 'password123';
const ORG_ID = 'org_dev_academy';
const OWNER_USER_ID = 'usr_dev_owner';
const COURSE_ID = 'crs_dev_welcome';
const FOUNDATIONS_COURSE_ID = 'crs_dev_foundations';

// Authored "Foundations" content captured from the editor (Plate blob verbatim).
// The activity's `settings` is embedded as-is (published:true), including the
// file node — its backing asset row is wiped on reseed, so the download 404s but
// the node still renders. Fine for a dev baseline.
const foundationsActivitySettings = {
  title: 'Welcome',
  content: {
    type: 'plate',
    config: [
      { id: 'gCe3sJNvcZ', type: 'h1', children: [{ text: 'Welcome' }] },
      { id: 'NrLjMCOdoP', type: 'p', children: [{ text: '' }] },
      {
        id: 'zdMcmvyTO6',
        type: 'code_block',
        children: [{ text: 'This is some coolf', type: 'code_line' }],
      },
      { id: 'Y1XpEJs8X-', type: 'p', children: [{ text: '' }] },
      {
        id: '0-XoFMfgzP-bjej6wJ6vz',
        url: 'http://localhost:8000/api/assets/ast_3GoLQlmZfBdenLuHiFTuiVNwzPR/file',
        name: 'Meiring de Wet — Cover Letter.pdf',
        type: 'file',
        children: [{ text: '' }],
        isUpload: true,
        mediaType: 'file',
        placeholderId: 'ZOip5QgOjV',
      },
      { id: 's6H7Pm7Zmg', type: 'p', children: [{ text: '' }] },
    ],
    version: 1,
  },
  published: true,
};

// A small Plate value the RSC Renderer can display (nodes the BaseEditorKit
// renders: h1/h2, paragraphs with marks, blockquote).
function plate(nodes: unknown[]) {
  return { type: 'plate', version: 1, config: nodes };
}

const lessonOne = plate([
  { type: 'h1', children: [{ text: 'Welcome to Atelier' }] },
  {
    type: 'p',
    children: [
      { text: 'This lesson is rendered from real course data by the ' },
      { text: 'Plate renderer', bold: true },
      { text: '.' },
    ],
  },
  { type: 'h2', children: [{ text: "What you'll learn" }] },
  {
    type: 'p',
    children: [{ text: 'How the student player pulls content from the Learn API and renders it.' }],
  },
  {
    type: 'blockquote',
    children: [{ text: 'Seeing is a decision — a small act of refusal against the familiar.' }],
  },
]);

const lessonTwo = plate([
  { type: 'h1', children: [{ text: 'The Second Lesson' }] },
  {
    type: 'p',
    children: [
      { text: "Content here is the activity's " },
      { text: 'settings.content.config', italic: true },
      { text: ' Plate value, guarded by type/version.' },
    ],
  },
]);

export async function seedDevStudent(db: ReturnType<typeof createDb>): Promise<void> {
  const passwordHash = await hashPassword(STUDENT_PASSWORD);
  const now = new Date();

  await db.transaction(async (tx) => {
    // Org owner (domain staff user; needed only for organizations.ownerId).
    await tx
      .insert(schema.users)
      .values({
        id: OWNER_USER_ID,
        externalId: 'ext_dev_owner',
        email: 'dev-owner@example.com',
        displayName: 'Dev Owner',
      })
      .onConflictDoNothing();

    await tx
      .insert(schema.organizations)
      .values({
        id: ORG_ID,
        externalId: 'ext_org_dev_academy',
        name: 'Dev Academy',
        slug: 'dev-academy',
        ownerId: OWNER_USER_ID,
      })
      .onConflictDoNothing();

    // better-auth user + credential account (the login).
    await tx
      .insert(user)
      .values({
        id: AUTH_USER_ID,
        name: 'Dev Student',
        email: STUDENT_EMAIL,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
    await tx
      .insert(account)
      .values({
        id: 'acc_dev_student',
        accountId: AUTH_USER_ID,
        providerId: 'credential',
        userId: AUTH_USER_ID,
        password: passwordHash,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();

    // Domain student — org-scoped; externalId links the session user to this
    // student within the dev org.
    await tx
      .insert(schema.students)
      .values({
        orgId: ORG_ID,
        id: 'stu_dev_student',
        externalId: AUTH_USER_ID,
        email: STUDENT_EMAIL,
        firstName: 'Dev',
        lastName: 'Student',
      })
      .onConflictDoNothing();

    // Published course + modules + activities with real Plate content.
    // Registry row first: courses FK into content_items (same id).
    await tx
      .insert(schema.contentItems)
      .values({ orgId: ORG_ID, id: COURSE_ID, type: 'course' })
      .onConflictDoNothing();
    await tx
      .insert(schema.courses)
      .values({
        orgId: ORG_ID,
        id: COURSE_ID,
        title: 'Welcome to Atelier',
        slug: 'welcome-to-atelier',
        description: 'A demo course rendered from real data via the Learn API and Plate renderer.',
        status: 'published',
        category: 'Design',
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.modules)
      .values({
        orgId: ORG_ID,
        id: 'mod_dev_1',
        courseId: COURSE_ID,
        title: 'Getting Started',
        seq: 0,
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.activities)
      .values([
        {
          orgId: ORG_ID,
          id: 'act_dev_1',
          moduleId: 'mod_dev_1',
          seq: 0,
          settings: { title: 'Welcome', published: true, content: lessonOne },
        },
        {
          orgId: ORG_ID,
          id: 'act_dev_2',
          moduleId: 'mod_dev_1',
          seq: 1,
          settings: { title: 'The Second Lesson', published: true, content: lessonTwo },
        },
      ])
      .onConflictDoNothing();

    // Active entitlement — what the Learn reader scopes to.
    await tx
      .insert(schema.entitlements)
      .values({
        orgId: ORG_ID,
        id: 'ent_dev_student',
        studentId: 'stu_dev_student',
        contentId: COURSE_ID,
        status: 'active',
        source: 'manual',
        expiresAt: null,
      })
      .onConflictDoNothing();

    // "Foundations" — a deterministic course carrying the captured authored
    // Plate content, in the same dev org, with the dev student entitled.
    await tx
      .insert(schema.contentItems)
      .values({ orgId: ORG_ID, id: FOUNDATIONS_COURSE_ID, type: 'course' })
      .onConflictDoNothing();
    await tx
      .insert(schema.courses)
      .values({
        orgId: ORG_ID,
        id: FOUNDATIONS_COURSE_ID,
        title: 'Foundations',
        slug: 'foundations',
        description: '',
        status: 'published',
        category: '',
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.modules)
      .values({
        orgId: ORG_ID,
        id: 'mod_dev_foundations',
        courseId: FOUNDATIONS_COURSE_ID,
        title: 'This is my cool course',
        seq: 0,
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.activities)
      .values({
        orgId: ORG_ID,
        id: 'act_dev_foundations',
        moduleId: 'mod_dev_foundations',
        seq: 0,
        settings: foundationsActivitySettings,
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.entitlements)
      .values({
        orgId: ORG_ID,
        id: 'ent_dev_foundations2',
        studentId: 'stu_dev_student',
        contentId: FOUNDATIONS_COURSE_ID,
        status: 'active',
        source: 'manual',
        expiresAt: null,
      })
      .onConflictDoNothing();
  });

  console.log(`Seeded dev student ${STUDENT_EMAIL} / ${STUDENT_PASSWORD} → course "${COURSE_ID}".`);
}

export async function runSeedDevStudent(databaseUrl: string): Promise<void> {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set.');
  }
  const db = createDb(databaseUrl);
  try {
    await seedDevStudent(db);
  } finally {
    await db.$client.end();
  }
}
