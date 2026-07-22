import type { Metadata } from 'next'
import { DocHeader, Prose } from '@/components/docs/prose'
import { DocsPager } from '@/components/docs/docs-pager'
import { CodeBlock } from '@/components/code-block'

export const metadata: Metadata = {
  title: 'Self-hosting — Headless LMS docs',
  description:
    'Create a standalone installation, or run the full workspace locally for development.',
}

const devSetup = `pnpm install
docker compose -f docker/docker-compose.yml up -d   # Postgres (:8005) + MinIO (:8006/:8007)
cp .env.example .env        # set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm db:generate && pnpm db:migrate
pnpm dev                    # api :8000 · admin :8001 · student :8002`

export default function SelfHostingPage() {
  return (
    <article>
      <DocHeader
        eyebrow="Getting started"
        title="Self-hosting"
        description="Spin up your own installation, or run the full workspace for local development."
      />

      <Prose>
        <h2>Create an installation</h2>
        <p>
          The fastest path is the CLI. It creates a small project that depends on{' '}
          <code>@headless-lms/server</code>, owns its config and plugins, and
          deploys anywhere Node and Postgres run.
        </p>
      </Prose>
      <div className="mt-5">
        <CodeBlock code="npm create headless-lms" language="bash" />
      </div>

      <Prose className="mt-8">
        <h2>Run the repo locally</h2>
        <p>
          To develop against the source, you&apos;ll need <strong>Node ≥ 22</strong>,{' '}
          <strong>pnpm 10</strong>, and <strong>Docker</strong>. The following
          brings up Postgres and MinIO, applies migrations, and starts every app.
        </p>
      </Prose>
      <div className="mt-5">
        <CodeBlock code={devSetup} language="bash" />
      </div>

      <Prose className="mt-8">
        <p>These commands run across all workspaces:</p>
        <ul>
          <li>
            <code>pnpm build</code> · <code>pnpm test</code> ·{' '}
            <code>pnpm lint</code> · <code>pnpm typecheck</code>
          </li>
          <li>
            <code>pnpm gen:sdk</code> regenerates the OpenAPI spec and SDK (the
            database must be running).
          </li>
        </ul>
        <h3>Default ports</h3>
        <ul>
          <li>
            <code>:8000</code> — API
          </li>
          <li>
            <code>:8001</code> — Admin dashboard
          </li>
          <li>
            <code>:8002</code> — Student portal
          </li>
          <li>
            <code>:8005</code> — Postgres · <code>:8006/:8007</code> — MinIO
          </li>
        </ul>
      </Prose>

      <DocsPager
        prev={{ title: 'Introduction', href: '/docs' }}
        next={{ title: 'Project structure', href: '/docs/project-structure' }}
      />
    </article>
  )
}
