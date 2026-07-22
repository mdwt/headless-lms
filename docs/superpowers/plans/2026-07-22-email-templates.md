# Email Template System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A closed catalog of every transactional email the system sends, a `TemplateRenderer` port that resolves `(templateId, context, params)` → rendered `{ subject, html, text }`, a default react-email implementation package, and installation-level replacement via the existing adapter-override mechanism.

**Architecture:** The catalog (template ids, per-template param types, `TemplateRenderer` interface) lives in `@headless-lms/types` next to `EmailSender` — pure types, zero deps. The server gains a `Mailer` (renderer + `EmailSender` composed) that all send sites call; the auth adapter switches from raw `EmailSender` to `Mailer`. The default renderer is a new workspace package `@headless-lms/adapter-email-templates` (react-email at call time; React is that package's dependency only). `apps/api` injects it exactly like the Resend and MinIO adapters. No renderer injected → fail-loudly stub, same pattern as `EmailAdapter`.

**Tech Stack:** TypeScript strict ESM, react-email (`@react-email/components`, `@react-email/render`), vitest, tsdown, pnpm workspace.

## Global Constraints

- Node 22, ESM, strict TypeScript; `tsc` never emits (tsdown owns builds).
- `@headless-lms/types` stays pure types — no runtime code, no dependencies, no React.
- Adapter packages depend only on `@headless-lms/types` (+ `@headless-lms/utils` if needed).
- `core/` may not import `adapters/`, frameworks, or drizzle (`pnpm lint` enforces).
- No AI-attribution trailers in commit messages (AGENTS.md).
- Single test run: `pnpm vitest run path/to/file.test.ts` from the workspace dir.
- After import-boundary changes, run `pnpm lint` from the repo root.

## Template Catalog (the contract this plan implements)

| id | params | wired send site after this plan |
|---|---|---|
| `magicLink` | `{ url }` | auth adapter `sendMagicLink` (exists today, inline) |
| `studentInvite` | `{ inviteUrl, studentName }` | none yet — send site arrives with the manual-student-creation spec |
| `memberInvite` | `{ inviteUrl, inviterName, role }` | auth adapter org plugin `sendInvitationEmail` (new) |
| `passwordReset` | `{ resetUrl }` | auth adapter `emailAndPassword.sendResetPassword` (new) |
| `emailVerification` | `{ verifyUrl }` | none yet — template ships; verification flow not enabled |
| `accessGranted` | `{ contentTitle, contentUrl }` | none yet — automations/entitlements later |
| `accessRevoked` | `{ contentTitle }` | none yet |
| `courseCompleted` | `{ courseTitle }` | none yet |

Every id must render in the default package; the closed union makes a partial replacement fail typecheck.

---

### Task 1: Template catalog types in `@headless-lms/types`

**Files:**
- Create: `packages/types/src/email-templates.ts`
- Modify: `packages/types/src/ports.ts` (add `html?` to `EmailMessage`)
- Modify: `packages/types/src/index.ts` (add export line)

**Interfaces:**
- Consumes: nothing.
- Produces: `TemplateContext`, `EmailContent`, `EmailTemplateParams`, `EmailTemplateId`, `TemplateRenderer` — every later task imports these from `@headless-lms/types`. `EmailMessage` gains `html?: string`.

This task is pure type declarations — no runtime code, so no test file (TDD exception; the types package has no tests today). Verification is `typecheck`.

- [ ] **Step 1: Create `packages/types/src/email-templates.ts`**

```ts
// Email template catalog — every transactional email the system can send.
// The closed EmailTemplateId union is the guarantee that templates exist: a
// TemplateRenderer implementation must answer every member or fail typecheck.

/** Branding threaded into every template. */
export interface TemplateContext {
  /** Product or organization name shown in the email. */
  brandName: string;
  /** Origin links resolve against (e.g. the admin app URL). */
  baseUrl: string;
  logoUrl?: string;
}

/** A fully rendered email, ready for an EmailSender. */
export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

/** Template id → params. Adding an email = adding a row here. */
export interface EmailTemplateParams {
  magicLink: { url: string };
  studentInvite: { inviteUrl: string; studentName: string };
  memberInvite: { inviteUrl: string; inviterName: string; role: string };
  passwordReset: { resetUrl: string };
  emailVerification: { verifyUrl: string };
  accessGranted: { contentTitle: string; contentUrl: string };
  accessRevoked: { contentTitle: string };
  courseCompleted: { courseTitle: string };
}

export type EmailTemplateId = keyof EmailTemplateParams;

/** Resolves a template + data to rendered content. Deployment-swappable;
 *  default implementation: @headless-lms/adapter-email-templates. */
export interface TemplateRenderer {
  render<K extends EmailTemplateId>(
    id: K,
    ctx: TemplateContext,
    params: EmailTemplateParams[K],
  ): Promise<EmailContent>;
}
```

- [ ] **Step 2: Add `html?` to `EmailMessage` in `packages/types/src/ports.ts`**

```ts
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Optional rendered HTML body; transports fall back to text when absent. */
  html?: string;
}
```

- [ ] **Step 3: Export from `packages/types/src/index.ts`**

Add after the `./ports.js` line:

```ts
export * from "./email-templates.js";
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @headless-lms/types typecheck` — expect clean exit.
Then `pnpm --filter @headless-lms/types build` (later tasks import the built package).

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/email-templates.ts packages/types/src/ports.ts packages/types/src/index.ts
git commit -m "feat(types): email template catalog and TemplateRenderer port"
```

---

### Task 2: Resend adapter forwards HTML

**Files:**
- Modify: `adapters/email-resend/src/index.ts`
- Test: `adapters/email-resend/src/index.test.ts`

**Interfaces:**
- Consumes: `EmailMessage.html?` from Task 1.
- Produces: no signature changes — the Resend payload now includes `html` when present.

- [ ] **Step 1: Write the failing test** — append to the existing `describe('ResendEmailAdapter')` in `adapters/email-resend/src/index.test.ts` (reuse the file's existing `fakeFetch` helper):

```ts
it('includes html in the payload when the message has it', async () => {
  const { calls, fetchFn } = fakeFetch(200, { id: 'email_123' });
  const adapter = new ResendEmailAdapter(
    { apiKey: 're_test_key', from: 'a@b.c' },
    undefined,
    fetchFn,
  );

  await adapter.send({ to: 's@e.com', subject: 'Hi', text: 'plain', html: '<p>rich</p>' });

  expect(JSON.parse(String(calls[0]?.init.body)).html).toBe('<p>rich</p>');
});

it('omits the html key when the message has none', async () => {
  const { calls, fetchFn } = fakeFetch(200, { id: 'email_123' });
  const adapter = new ResendEmailAdapter(
    { apiKey: 're_test_key', from: 'a@b.c' },
    undefined,
    fetchFn,
  );

  await adapter.send({ to: 's@e.com', subject: 'Hi', text: 'plain' });

  expect('html' in JSON.parse(String(calls[0]?.init.body))).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @headless-lms/adapter-email-resend exec vitest run src/index.test.ts`
Expected: first new test FAILS (`html` is `undefined` in the payload — JSON.stringify drops it, so assert equality fails).

- [ ] **Step 3: Implement** — in `adapters/email-resend/src/index.ts`, change the `body` construction:

```ts
      body: JSON.stringify({
        from: this.config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html !== undefined && { html: message.html }),
      }),
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @headless-lms/adapter-email-resend exec vitest run src/index.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add adapters/email-resend/src
git commit -m "feat(adapter-email-resend): forward html body to Resend"
```

---

### Task 3: `Mailer` and the fail-loudly stub renderer

**Files:**
- Create: `packages/server/src/core/shared/mailer.ts`
- Test: `packages/server/src/core/shared/mailer.test.ts`
- Modify: `packages/server/src/core/shared/ports.ts` (re-export template types)
- Modify: `packages/server/src/adapters/email/index.ts` (add `StubTemplateRenderer`)

**Interfaces:**
- Consumes: `TemplateRenderer`, `TemplateContext`, `EmailTemplateId`, `EmailTemplateParams`, `EmailContent`, `EmailSender` (Task 1, via `core/shared/ports.js` re-exports).
- Produces: `class Mailer { constructor(templates: TemplateRenderer, email: EmailSender, ctx: TemplateContext); send<K extends EmailTemplateId>(to: string, id: K, params: EmailTemplateParams[K], ctx?: Partial<TemplateContext>): Promise<void> }` and `class StubTemplateRenderer implements TemplateRenderer`. Task 4 wires both.

- [ ] **Step 1: Re-export template types from `packages/server/src/core/shared/ports.ts`** — extend the existing `import type { ... } from '@headless-lms/types'` / `export type { ... }` lists with:

```ts
  EmailContent,
  EmailTemplateId,
  EmailTemplateParams,
  TemplateContext,
  TemplateRenderer,
```

(both in the `import type` block and the `export type` block, alphabetical position matching the file's style).

- [ ] **Step 2: Write the failing test** — `packages/server/src/core/shared/mailer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Mailer } from './mailer.js';
import type {
  EmailContent,
  EmailMessage,
  EmailTemplateId,
  TemplateContext,
  TemplateRenderer,
} from './ports.js';

function fakes() {
  const rendered: { id: EmailTemplateId; ctx: TemplateContext; params: unknown }[] = [];
  const sent: EmailMessage[] = [];
  const templates: TemplateRenderer = {
    async render(id, ctx, params): Promise<EmailContent> {
      rendered.push({ id, ctx, params });
      return { subject: `subject:${id}`, html: `<p>${id}</p>`, text: `text:${id}` };
    },
  };
  const email = {
    async send(message: EmailMessage) {
      sent.push(message);
    },
  };
  return { rendered, sent, templates, email };
}

const CTX: TemplateContext = { brandName: 'Acme LMS', baseUrl: 'http://localhost:8001' };

describe('Mailer', () => {
  it('renders the template and sends the result', async () => {
    const { rendered, sent, templates, email } = fakes();
    const mailer = new Mailer(templates, email, CTX);

    await mailer.send('s@e.com', 'magicLink', { url: 'http://x/y' });

    expect(rendered).toEqual([{ id: 'magicLink', ctx: CTX, params: { url: 'http://x/y' } }]);
    expect(sent).toEqual([
      { to: 's@e.com', subject: 'subject:magicLink', text: 'text:magicLink', html: '<p>magicLink</p>' },
    ]);
  });

  it('merges a per-send context override over the default', async () => {
    const { rendered, templates, email } = fakes();
    const mailer = new Mailer(templates, email, CTX);

    await mailer.send('s@e.com', 'memberInvite',
      { inviteUrl: 'http://x', inviterName: 'Ann', role: 'admin' },
      { brandName: 'Ann Org' },
    );

    expect(rendered[0]?.ctx).toEqual({ brandName: 'Ann Org', baseUrl: 'http://localhost:8001' });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @headless-lms/server exec vitest run src/core/shared/mailer.test.ts`
Expected: FAIL — `Mailer` module does not exist.

- [ ] **Step 4: Implement `packages/server/src/core/shared/mailer.ts`**

```ts
// Composes a TemplateRenderer with an EmailSender: callers name a template,
// the mailer resolves content and hands it to the transport.
import type {
  EmailSender,
  EmailTemplateId,
  EmailTemplateParams,
  TemplateContext,
  TemplateRenderer,
} from './ports.js';

export class Mailer {
  constructor(
    private readonly templates: TemplateRenderer,
    private readonly email: EmailSender,
    private readonly ctx: TemplateContext,
  ) {}

  async send<K extends EmailTemplateId>(
    to: string,
    id: K,
    params: EmailTemplateParams[K],
    ctx?: Partial<TemplateContext>,
  ): Promise<void> {
    const content = await this.templates.render(id, { ...this.ctx, ...ctx }, params);
    await this.email.send({ to, subject: content.subject, text: content.text, html: content.html });
  }
}
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter @headless-lms/server exec vitest run src/core/shared/mailer.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the stub renderer** to `packages/server/src/adapters/email/index.ts` (below `EmailAdapter`, same fail-loudly pattern):

```ts
export class StubTemplateRenderer implements TemplateRenderer {
  constructor(private readonly logger: Logger = noopLogger) {}

  async render(id: EmailTemplateId): Promise<never> {
    this.logger.error('template render failed: no renderer configured', { id });
    throw new Error('no template renderer configured');
  }
}
```

Extend the file's type import to `import type { EmailSender, EmailMessage, EmailTemplateId, Logger, TemplateRenderer } from '../../core/shared/ports.js';`.

- [ ] **Step 7: Typecheck and commit**

Run: `pnpm --filter @headless-lms/server typecheck` — clean.

```bash
git add packages/server/src/core/shared packages/server/src/adapters/email/index.ts
git commit -m "feat(server): Mailer composing TemplateRenderer with EmailSender"
```

---

### Task 4: Container + auth adapter wiring

**Files:**
- Modify: `packages/server/src/app/container.ts`
- Modify: `packages/server/src/adapters/auth/index.ts`
- Modify: `packages/server/src/index.ts`

**Interfaces:**
- Consumes: `Mailer`, `StubTemplateRenderer` (Task 3).
- Produces: `AdapterOverrides.templates?: TemplateRenderer`; `Config.adminUrl: string`; `Config.emailBranding?: TemplateContext`; `Container.mailer: Mailer`; `CreateAuthOptions.mailer: Mailer` + `CreateAuthOptions.adminUrl: string` (replacing `email: EmailSender`). Task 6 supplies the new config from env.

No new unit test: `buildContainer`/`createAuth` need a live DB and have no test today (container.test.ts covers only pure resolvers). Verification is typecheck + lint + the existing suite.

- [ ] **Step 1: Extend `AdapterOverrides` and `Config` in `packages/server/src/app/container.ts`**

```ts
export interface AdapterOverrides {
  email?: EmailSender;
  storage?: ObjectStorage;
  /** Resolves email templates to rendered content. Absent → fail-loudly stub. */
  templates?: TemplateRenderer;
}
```

In `Config`, after `mcpLoginPage`:

```ts
  /** Admin app origin — invitation links resolve against it. */
  adminUrl: string;
  /** Branding threaded into every email template. Default: brandName "Headless LMS", baseUrl = adminUrl. */
  emailBranding?: TemplateContext;
```

Extend the `from '../core/shared/ports.js'` type import with `TemplateContext, TemplateRenderer` and the `from '../adapters/email/index.js'` import to `import { EmailAdapter, StubTemplateRenderer } from '../adapters/email/index.js';`. Add `import { Mailer } from '../core/shared/mailer.js';`.

- [ ] **Step 2: Build the mailer in `buildContainer`** — after the `email` adapter line:

```ts
  const templates =
    options?.adapters?.templates ?? new StubTemplateRenderer(logger.child({ name: 'email' }));
  const mailer = new Mailer(
    templates,
    email,
    config.emailBranding ?? { brandName: 'Headless LMS', baseUrl: config.adminUrl },
  );
```

Add `mailer: Mailer;` to the `Container` interface (after `storage`) and `mailer,` to the returned object.

- [ ] **Step 3: Switch the auth adapter to the mailer** — in `packages/server/src/adapters/auth/index.ts`:

Replace in `CreateAuthOptions`:

```ts
  /** Sends transactional auth emails via the template catalog. */
  mailer: Mailer;
  /** Admin app origin — invitation accept links resolve against it. */
  adminUrl: string;
```

(remove `email: EmailSender`; add `import type { Mailer } from '../../core/shared/mailer.js';` — drop the now-unused `EmailSender` import if nothing else uses it).

Replace the magic-link plugin body:

```ts
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await opts.mailer.send(email, 'magicLink', { url });
        },
      }),
```

Extend `emailAndPassword`:

```ts
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ user, url }) => {
        await opts.mailer.send(user.email, 'passwordReset', { resetUrl: url });
      },
    },
```

Add to the `organization({ ... })` options (sibling of `organizationHooks`):

```ts
        sendInvitationEmail: async (data) => {
          await opts.mailer.send(
            data.email,
            'memberInvite',
            {
              inviteUrl: `${opts.adminUrl}/accept-invitation/${data.id}`,
              inviterName: data.inviter.user.name,
              role: data.role,
            },
            { brandName: data.organization.name },
          );
        },
```

- [ ] **Step 4: Update the container's `createAuth` call** — where the container currently passes `email,` to `createAuth`, pass instead:

```ts
    mailer,
    adminUrl: config.adminUrl,
```

- [ ] **Step 5: Export `Mailer` type from `packages/server/src/index.ts`** — add to the `export type { ... } from './core/shared/ports.js'` neighborhood:

```ts
export type { Mailer } from './core/shared/mailer.js';
```

- [ ] **Step 6: Verify**

Run: `pnpm --filter @headless-lms/server typecheck` — clean. (`apps/api` will fail typecheck until Task 6 adds `adminUrl` — expected; verify with `pnpm --filter @headless-lms/server test` and root `pnpm lint` only.)
Run: `pnpm --filter @headless-lms/server test` — no new failures (the three pre-existing `src/http/` failures are known).
Run: `pnpm lint` — clean (mailer.ts is core→core; container imports both layers legally).

- [ ] **Step 7: Commit**

```bash
git add packages/server/src
git commit -m "feat(server): wire Mailer through container and auth adapter"
```

---

### Task 5: Default renderer package `@headless-lms/adapter-email-templates`

**Files:**
- Create: `adapters/email-templates/package.json`, `adapters/email-templates/tsconfig.json`, `adapters/email-templates/tsdown.config.ts`
- Create: `adapters/email-templates/src/emails/layout.tsx`
- Create: `adapters/email-templates/src/emails/{magic-link,student-invite,member-invite,password-reset,email-verification,access-granted,access-revoked,course-completed}.tsx`
- Create: `adapters/email-templates/src/index.tsx`
- Test: `adapters/email-templates/src/index.test.tsx`

**Interfaces:**
- Consumes: `TemplateRenderer`, `TemplateContext`, `EmailTemplateId`, `EmailTemplateParams`, `EmailContent` from `@headless-lms/types`.
- Produces: `export class ReactEmailTemplateRenderer implements TemplateRenderer` — Task 6 instantiates it with no constructor args.

- [ ] **Step 1: Scaffold the package**

`adapters/email-templates/package.json` (versions get filled by pnpm in step 2):

```json
{
  "name": "@headless-lms/adapter-email-templates",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "dev": "email dev --dir src/emails"
  }
}
```

`adapters/email-templates/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["src/**/*.test.tsx"]
}
```

`adapters/email-templates/tsdown.config.ts` (copy of email-resend's with the tsx entry):

```ts
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  fixedExtension: false,
  dts: true,
  sourcemap: true,
  clean: true,
});
```

- [ ] **Step 2: Install dependencies** (pnpm resolves current versions)

```bash
pnpm --filter @headless-lms/adapter-email-templates add react @react-email/components @react-email/render
pnpm --filter @headless-lms/adapter-email-templates add '@headless-lms/types@workspace:*'
pnpm --filter @headless-lms/adapter-email-templates add -D react-email @types/react @types/node tsdown typescript vitest
```

- [ ] **Step 3: Write the failing test** — `adapters/email-templates/src/index.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import type { EmailTemplateId, EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { ReactEmailTemplateRenderer } from './index.js';

const CTX: TemplateContext = {
  brandName: 'Acme LMS',
  baseUrl: 'http://localhost:8001',
};

const SAMPLE_PARAMS: { [K in EmailTemplateId]: EmailTemplateParams[K] } = {
  magicLink: { url: 'http://localhost:8001/magic?token=t' },
  studentInvite: { inviteUrl: 'http://localhost:8002/signup?token=t', studentName: 'Sam Doe' },
  memberInvite: { inviteUrl: 'http://localhost:8001/accept-invitation/inv1', inviterName: 'Ann', role: 'admin' },
  passwordReset: { resetUrl: 'http://localhost:8002/reset?token=t' },
  emailVerification: { verifyUrl: 'http://localhost:8002/verify?token=t' },
  accessGranted: { contentTitle: 'Fly Tying 101', contentUrl: 'http://localhost:8002/courses/c1' },
  accessRevoked: { contentTitle: 'Fly Tying 101' },
  courseCompleted: { courseTitle: 'Fly Tying 101' },
};

const ALL_IDS = Object.keys(SAMPLE_PARAMS) as EmailTemplateId[];

describe('ReactEmailTemplateRenderer', () => {
  const renderer = new ReactEmailTemplateRenderer();

  it.each(ALL_IDS)('renders %s with subject, html and text', async (id) => {
    const content = await renderer.render(id, CTX, SAMPLE_PARAMS[id]);
    expect(content.subject.length).toBeGreaterThan(0);
    expect(content.html).toContain('<');
    expect(content.text.length).toBeGreaterThan(0);
  });

  it('interpolates params into html and text', async () => {
    const content = await renderer.render('studentInvite', CTX, SAMPLE_PARAMS.studentInvite);
    expect(content.html).toContain('http://localhost:8002/signup?token=t');
    expect(content.html).toContain('Sam Doe');
    expect(content.text).toContain('http://localhost:8002/signup?token=t');
  });

  it('brands every email with the context brand name', async () => {
    const content = await renderer.render('magicLink', CTX, SAMPLE_PARAMS.magicLink);
    expect(content.html).toContain('Acme LMS');
  });

  it('escapes html in user-supplied params', async () => {
    const content = await renderer.render('studentInvite', CTX, {
      inviteUrl: 'http://x',
      studentName: '<script>alert(1)</script>',
    });
    expect(content.html).not.toContain('<script>');
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `pnpm --filter @headless-lms/adapter-email-templates exec vitest run`
Expected: FAIL — `./index.js` does not exist.

- [ ] **Step 5: Implement the shared layout** — `adapters/email-templates/src/emails/layout.tsx`:

```tsx
import { Body, Container, Head, Heading, Html, Img, Section, Text } from '@react-email/components';
import type { ReactNode } from 'react';
import type { TemplateContext } from '@headless-lms/types';

export function Layout({ ctx, heading, children }: {
  ctx: TemplateContext;
  heading: string;
  children: ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: '#f6f6f6', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <Container style={{ backgroundColor: '#ffffff', margin: '24px auto', padding: '32px', maxWidth: '480px' }}>
          {ctx.logoUrl ? (
            <Img src={ctx.logoUrl} alt={ctx.brandName} height={32} style={{ marginBottom: '16px' }} />
          ) : (
            <Text style={{ fontWeight: 700, marginBottom: '16px' }}>{ctx.brandName}</Text>
          )}
          <Heading as="h2" style={{ fontSize: '20px' }}>{heading}</Heading>
          <Section>{children}</Section>
          <Text style={{ color: '#8a8a8a', fontSize: '12px', marginTop: '32px' }}>
            Sent by {ctx.brandName} · {ctx.baseUrl}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const PREVIEW_CTX: TemplateContext = {
  brandName: 'Acme LMS',
  baseUrl: 'http://localhost:8001',
};
```

- [ ] **Step 6: Implement the eight templates.** Each file exports `subject(ctx, params)`, a default component taking `{ ctx, params }`, and `PreviewProps` for the react-email dev server. All use `Button`/`Text`/`Link` from `@react-email/components` inside `Layout`.

`src/emails/magic-link.tsx`:

```tsx
import { Button, Text } from '@react-email/components';
import type { EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { Layout, PREVIEW_CTX } from './layout.js';

type Params = EmailTemplateParams['magicLink'];

export const subject = (ctx: TemplateContext, _params: Params) => `Sign in to ${ctx.brandName}`;

export default function MagicLink({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading="Sign in">
      <Text>Click the button below to sign in. This link is valid once and expires shortly.</Text>
      <Button href={params.url} style={{ backgroundColor: '#111', color: '#fff', padding: '10px 20px' }}>
        Sign in to {ctx.brandName}
      </Button>
      <Text>If you did not request this, you can ignore this email.</Text>
    </Layout>
  );
}

MagicLink.PreviewProps = { ctx: PREVIEW_CTX, params: { url: 'http://localhost:8002/magic?token=demo' } };
```

`src/emails/student-invite.tsx`:

```tsx
import { Button, Text } from '@react-email/components';
import type { EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { Layout, PREVIEW_CTX } from './layout.js';

type Params = EmailTemplateParams['studentInvite'];

export const subject = (ctx: TemplateContext, _params: Params) => `You're invited to ${ctx.brandName}`;

export default function StudentInvite({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading={`Welcome, ${params.studentName}`}>
      <Text>You've been invited to {ctx.brandName}. Create your account to get started.</Text>
      <Button href={params.inviteUrl} style={{ backgroundColor: '#111', color: '#fff', padding: '10px 20px' }}>
        Create your account
      </Button>
      <Text>This invitation link is personal — please don't forward it.</Text>
    </Layout>
  );
}

StudentInvite.PreviewProps = {
  ctx: PREVIEW_CTX,
  params: { inviteUrl: 'http://localhost:8002/signup?token=demo', studentName: 'Sam Doe' },
};
```

`src/emails/member-invite.tsx`:

```tsx
import { Button, Text } from '@react-email/components';
import type { EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { Layout, PREVIEW_CTX } from './layout.js';

type Params = EmailTemplateParams['memberInvite'];

export const subject = (ctx: TemplateContext, _params: Params) =>
  `You've been invited to join ${ctx.brandName}`;

export default function MemberInvite({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading={`Join ${ctx.brandName}`}>
      <Text>
        {params.inviterName} invited you to join {ctx.brandName} as {params.role}.
      </Text>
      <Button href={params.inviteUrl} style={{ backgroundColor: '#111', color: '#fff', padding: '10px 20px' }}>
        Accept invitation
      </Button>
      <Text>If you weren't expecting this invitation, you can ignore this email.</Text>
    </Layout>
  );
}

MemberInvite.PreviewProps = {
  ctx: PREVIEW_CTX,
  params: { inviteUrl: 'http://localhost:8001/accept-invitation/demo', inviterName: 'Ann', role: 'admin' },
};
```

`src/emails/password-reset.tsx`:

```tsx
import { Button, Text } from '@react-email/components';
import type { EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { Layout, PREVIEW_CTX } from './layout.js';

type Params = EmailTemplateParams['passwordReset'];

export const subject = (ctx: TemplateContext, _params: Params) => `Reset your ${ctx.brandName} password`;

export default function PasswordReset({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading="Reset your password">
      <Text>Click the button below to choose a new password. The link expires shortly.</Text>
      <Button href={params.resetUrl} style={{ backgroundColor: '#111', color: '#fff', padding: '10px 20px' }}>
        Reset password
      </Button>
      <Text>If you did not request a reset, your password is unchanged and you can ignore this email.</Text>
    </Layout>
  );
}

PasswordReset.PreviewProps = { ctx: PREVIEW_CTX, params: { resetUrl: 'http://localhost:8002/reset?token=demo' } };
```

`src/emails/email-verification.tsx`:

```tsx
import { Button, Text } from '@react-email/components';
import type { EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { Layout, PREVIEW_CTX } from './layout.js';

type Params = EmailTemplateParams['emailVerification'];

export const subject = (ctx: TemplateContext, _params: Params) => `Verify your email for ${ctx.brandName}`;

export default function EmailVerification({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading="Verify your email">
      <Text>Confirm this is your email address to finish setting up your account.</Text>
      <Button href={params.verifyUrl} style={{ backgroundColor: '#111', color: '#fff', padding: '10px 20px' }}>
        Verify email
      </Button>
    </Layout>
  );
}

EmailVerification.PreviewProps = { ctx: PREVIEW_CTX, params: { verifyUrl: 'http://localhost:8002/verify?token=demo' } };
```

`src/emails/access-granted.tsx`:

```tsx
import { Button, Text } from '@react-email/components';
import type { EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { Layout, PREVIEW_CTX } from './layout.js';

type Params = EmailTemplateParams['accessGranted'];

export const subject = (_ctx: TemplateContext, params: Params) => `You now have access to ${params.contentTitle}`;

export default function AccessGranted({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading={`${params.contentTitle} is ready for you`}>
      <Text>You've been granted access. Jump in whenever you're ready.</Text>
      <Button href={params.contentUrl} style={{ backgroundColor: '#111', color: '#fff', padding: '10px 20px' }}>
        Start learning
      </Button>
    </Layout>
  );
}

AccessGranted.PreviewProps = {
  ctx: PREVIEW_CTX,
  params: { contentTitle: 'Fly Tying 101', contentUrl: 'http://localhost:8002/courses/demo' },
};
```

`src/emails/access-revoked.tsx`:

```tsx
import { Text } from '@react-email/components';
import type { EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { Layout, PREVIEW_CTX } from './layout.js';

type Params = EmailTemplateParams['accessRevoked'];

export const subject = (_ctx: TemplateContext, params: Params) => `Your access to ${params.contentTitle} has ended`;

export default function AccessRevoked({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading="Access ended">
      <Text>Your access to {params.contentTitle} has ended. If you think this is a mistake, reply to this email.</Text>
    </Layout>
  );
}

AccessRevoked.PreviewProps = { ctx: PREVIEW_CTX, params: { contentTitle: 'Fly Tying 101' } };
```

`src/emails/course-completed.tsx`:

```tsx
import { Text } from '@react-email/components';
import type { EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { Layout, PREVIEW_CTX } from './layout.js';

type Params = EmailTemplateParams['courseCompleted'];

export const subject = (_ctx: TemplateContext, params: Params) => `You completed ${params.courseTitle} 🎉`;

export default function CourseCompleted({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading="Congratulations!">
      <Text>You've completed {params.courseTitle}. Nice work.</Text>
    </Layout>
  );
}

CourseCompleted.PreviewProps = { ctx: PREVIEW_CTX, params: { courseTitle: 'Fly Tying 101' } };
```

- [ ] **Step 7: Implement the renderer** — `adapters/email-templates/src/index.tsx`:

```tsx
// Default TemplateRenderer: react-email components rendered at call time.
import { render } from '@react-email/render';
import type { JSX } from 'react';
import type {
  EmailContent,
  EmailTemplateId,
  EmailTemplateParams,
  TemplateContext,
  TemplateRenderer,
} from '@headless-lms/types';
import MagicLink, { subject as magicLink } from './emails/magic-link.js';
import StudentInvite, { subject as studentInvite } from './emails/student-invite.js';
import MemberInvite, { subject as memberInvite } from './emails/member-invite.js';
import PasswordReset, { subject as passwordReset } from './emails/password-reset.js';
import EmailVerification, { subject as emailVerification } from './emails/email-verification.js';
import AccessGranted, { subject as accessGranted } from './emails/access-granted.js';
import AccessRevoked, { subject as accessRevoked } from './emails/access-revoked.js';
import CourseCompleted, { subject as courseCompleted } from './emails/course-completed.js';

interface Entry<K extends EmailTemplateId> {
  subject: (ctx: TemplateContext, params: EmailTemplateParams[K]) => string;
  Component: (props: { ctx: TemplateContext; params: EmailTemplateParams[K] }) => JSX.Element;
}

// The catalog is closed: a missing key here is a compile error.
const registry: { [K in EmailTemplateId]: Entry<K> } = {
  magicLink: { subject: magicLink, Component: MagicLink },
  studentInvite: { subject: studentInvite, Component: StudentInvite },
  memberInvite: { subject: memberInvite, Component: MemberInvite },
  passwordReset: { subject: passwordReset, Component: PasswordReset },
  emailVerification: { subject: emailVerification, Component: EmailVerification },
  accessGranted: { subject: accessGranted, Component: AccessGranted },
  accessRevoked: { subject: accessRevoked, Component: AccessRevoked },
  courseCompleted: { subject: courseCompleted, Component: CourseCompleted },
};

export class ReactEmailTemplateRenderer implements TemplateRenderer {
  async render<K extends EmailTemplateId>(
    id: K,
    ctx: TemplateContext,
    params: EmailTemplateParams[K],
  ): Promise<EmailContent> {
    const entry = registry[id] as Entry<K>;
    const element = <entry.Component ctx={ctx} params={params} />;
    const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
    return { subject: entry.subject(ctx, params), html, text };
  }
}
```

- [ ] **Step 8: Run to verify pass**

Run: `pnpm --filter @headless-lms/adapter-email-templates exec vitest run`
Expected: all tests PASS.

- [ ] **Step 9: Verify build, typecheck, and preview server boots**

Run: `pnpm --filter @headless-lms/adapter-email-templates typecheck` — clean.
Run: `pnpm --filter @headless-lms/adapter-email-templates build` — emits `dist/`.
Spot-check preview: `pnpm --filter @headless-lms/adapter-email-templates dev` — react-email dev server lists the eight templates (Ctrl-C after confirming; skip in headless execution).

- [ ] **Step 10: Commit**

```bash
git add adapters/email-templates pnpm-lock.yaml
git commit -m "feat(adapter-email-templates): default react-email template renderer"
```

---

### Task 6: Wire the default renderer + branding in `apps/api`

**Files:**
- Modify: `apps/api/package.json` (dependency)
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `ReactEmailTemplateRenderer` (Task 5), `Config.adminUrl` / `Config.emailBranding` (Task 4).
- Produces: nothing downstream.

- [ ] **Step 1: Add the dependency**

```bash
pnpm --filter @headless-lms/api add '@headless-lms/adapter-email-templates@workspace:*'
```

- [ ] **Step 2: Extend `apps/api/src/config.ts`** — inside `loadContainerConfig()`, the admin origin is the first client origin; add after `mcpLoginPage`:

```ts
    adminUrl: process.env.ADMIN_URL ?? clientOrigins[0] ?? "http://localhost:8001",
    emailBranding: {
      brandName: process.env.BRAND_NAME ?? "Headless LMS",
      baseUrl: process.env.ADMIN_URL ?? clientOrigins[0] ?? "http://localhost:8001",
      logoUrl: process.env.EMAIL_LOGO_URL || undefined,
    },
```

- [ ] **Step 3: Inject the renderer in `apps/api/src/main.ts`**

```ts
import { ReactEmailTemplateRenderer } from "@headless-lms/adapter-email-templates";
```

and in the `adapters` object:

```ts
    templates: new ReactEmailTemplateRenderer(),
```

- [ ] **Step 4: Document the env vars in `.env.example`** — after the Email (Resend) block:

```bash
# Email branding — shown in every transactional email.
BRAND_NAME=Headless LMS
# Optional logo URL rendered in the email header.
EMAIL_LOGO_URL=
# Admin app origin; invitation links resolve against it. Defaults to the first CLIENT_ORIGIN.
ADMIN_URL=
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter @headless-lms/api typecheck` — clean.
Run: `pnpm dev` briefly (needs DB up) — server boots; Ctrl-C. Skip if DB unavailable.

- [ ] **Step 6: Commit**

```bash
git add apps/api .env.example pnpm-lock.yaml
git commit -m "feat(api): wire react-email template renderer and email branding"
```

---

### Task 7: Full verification

**Files:** none new.

- [ ] **Step 1: Full test suites**

Run: `pnpm --filter @headless-lms/server test`, `pnpm --filter @headless-lms/adapter-email-resend test`, `pnpm --filter @headless-lms/adapter-email-templates test`
Expected: only the three known pre-existing `src/http/` failures in the server suite (discovery, oauth-token, mcp/route — unrelated fastify schema issue in uncommitted MCP work); everything else passes.

- [ ] **Step 2: Lint + typecheck everywhere**

Run: `pnpm lint && pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Live smoke (optional, needs RESEND_API_KEY in .env and DB up)**

Boot `pnpm dev`, request a magic link from the student login page for the Resend account owner's address, confirm a branded HTML email arrives.

---

## Replacement story (for the README / docs, no task)

An installation replaces all templates by implementing `TemplateRenderer` from `@headless-lms/types` and passing it as `adapters.templates` to `createContainer`. Replacing one template: wrap the default —

```ts
class MyTemplates implements TemplateRenderer {
  private base = new ReactEmailTemplateRenderer();
  async render(id, ctx, params) {
    if (id === 'studentInvite') return myStudentInvite(ctx, params);
    return this.base.render(id, ctx, params);
  }
}
```

The closed `EmailTemplateId` union guarantees completeness at compile time.
