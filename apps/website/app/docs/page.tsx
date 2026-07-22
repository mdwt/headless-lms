import type { Metadata } from 'next'
import { DocHeader, Prose } from '@/components/docs/prose'
import { DocsPager } from '@/components/docs/docs-pager'
import { CodeBlock } from '@/components/code-block'

export const metadata: Metadata = {
  title: 'Introduction — Headless LMS docs',
  description:
    'What Headless LMS is, why it is API-first, and how an installation composes the server.',
}

export default function DocsIntroPage() {
  return (
    <article>
      <DocHeader
        eyebrow="Getting started"
        title="Introduction"
        description="An API-first LMS platform for building learning systems in modern TypeScript."
      />

      <Prose>
        <p>
          <strong>Headless LMS</strong> gives you the full domain of a learning
          management system — courses, progress, entitlements, and org-scoped
          multi-tenancy — exposed as a typed API. It is headless by design: build
          whatever frontend you want on the generated SDK.
        </p>

        <h2>Why headless</h2>
        <ul>
          <li>
            <strong>Modern TypeScript.</strong> Fastify, Drizzle, and Zod with
            strict ESM.
          </li>
          <li>
            <strong>Composable.</strong> Swappable adapters for storage and email;
            integrations plug in as folders.
          </li>
          <li>
            <strong>Secure by default.</strong> Authentication, org-scoped
            multi-tenancy, encrypted credential storage, and validated requests
            and responses.
          </li>
          <li>
            <strong>Headless.</strong> Build any frontend you want on the typed
            SDK.
          </li>
        </ul>

        <h2>Quick start</h2>
        <p>
          Create a standalone installation using the CLI. It scaffolds a small
          project that depends on <code>@headless-lms/server</code>, owns its
          config and plugins, and deploys anywhere Node and Postgres run.
        </p>
      </Prose>

      <div className="mt-5">
        <CodeBlock code="npm create headless-lms" language="bash" />
      </div>

      <Prose className="mt-6">
        <p>
          Prefer to explore the source first? Clone the repository and follow the{' '}
          <a href="/docs/self-hosting">self-hosting guide</a> to run the API,
          admin dashboard, and student portal locally.
        </p>
      </Prose>

      <DocsPager next={{ title: 'Self-hosting', href: '/docs/self-hosting' }} />
    </article>
  )
}
