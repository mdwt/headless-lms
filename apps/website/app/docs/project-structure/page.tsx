import type { Metadata } from 'next'
import { DocHeader, Prose } from '@/components/docs/prose'
import { DocsPager } from '@/components/docs/docs-pager'
import { CodeBlock } from '@/components/code-block'

export const metadata: Metadata = {
  title: 'Project structure — Headless LMS docs',
  description: 'The workspaces that make up the Headless LMS monorepo.',
}

const tree = `headless-lms/
├─ packages/
│  ├─ server/                # @headless-lms/server — the backend library
│  ├─ sdk/                   # generated typed client
│  └─ create-headless-lms/   # the installation scaffolder
├─ apps/
│  ├─ api/                   # example installation
│  ├─ admin/                 # Next.js admin back-office
│  └─ student/               # Next.js student portal
└─ docker/                   # Postgres + MinIO for local dev`

export default function ProjectStructurePage() {
  return (
    <article>
      <DocHeader
        eyebrow="Concepts"
        title="Project structure"
        description="How the monorepo is organized and what each workspace is responsible for."
      />

      <div>
        <CodeBlock code={tree} language="text" filename="workspaces" />
      </div>

      <Prose className="mt-8">
        <h2>Packages</h2>
        <ul>
          <li>
            <code>@headless-lms/server</code> — a framework-free domain core
            behind a Fastify HTTP layer, persisted with Drizzle and Postgres. The
            backend ships as this library.
          </li>
          <li>
            <code>@headless-lms/sdk</code> — the typed client, generated from the
            OpenAPI spec that the server produces.
          </li>
          <li>
            <code>create-headless-lms</code> — the scaffolder behind{' '}
            <code>npm create headless-lms</code>.
          </li>
        </ul>

        <h2>Apps</h2>
        <ul>
          <li>
            <code>apps/api</code> — an example installation that composes the
            server with sane defaults. Use it as a reference for your own.
          </li>
          <li>
            <code>apps/admin</code> — the Next.js admin dashboard for courses,
            students, entitlements, and reporting.
          </li>
          <li>
            <code>apps/student</code> — the Next.js app where students log in and
            take their courses.
          </li>
        </ul>

        <h2>Composing an installation</h2>
        <p>
          An <em>installation</em> composes what it wants with sane defaults —
          picking storage and email adapters, registering plugins, and owning its
          config. See <code>apps/api</code> for a working example.
        </p>
      </Prose>

      <DocsPager
        prev={{ title: 'Self-hosting', href: '/docs/self-hosting' }}
        next={{ title: 'API reference', href: '/docs/api-reference' }}
      />
    </article>
  )
}
