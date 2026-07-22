import type { Metadata } from 'next'
import { DocHeader, Prose } from '@/components/docs/prose'
import { DocsPager } from '@/components/docs/docs-pager'
import { CodeBlock } from '@/components/code-block'

export const metadata: Metadata = {
  title: 'API reference — Headless LMS docs',
  description:
    'How the API, OpenAPI spec, and typed SDK relate, and where to find the interactive reference.',
}

const endpoints = [
  { method: 'POST', path: '/orgs/:orgId/courses', desc: 'Create a course' },
  { method: 'GET', path: '/orgs/:orgId/courses', desc: 'List courses' },
  { method: 'POST', path: '/entitlements', desc: 'Grant student access' },
  { method: 'DELETE', path: '/entitlements/:id', desc: 'Revoke access' },
  { method: 'GET', path: '/students/:id/progress', desc: 'Read progress' },
  { method: 'POST', path: '/mcp', desc: 'MCP endpoint (OAuth)' },
]

const methodTone: Record<string, string> = {
  GET: 'text-primary',
  POST: 'text-chart-3',
  DELETE: 'text-destructive',
}

const sdkExample = `import { createClient } from "@headless-lms/sdk"

const lms = createClient({ baseUrl, token })

const { data, error } = await lms.students.progress({
  studentId,
})`

export default function ApiReferencePage() {
  return (
    <article>
      <DocHeader
        eyebrow="Concepts"
        title="API reference"
        description="Routes validate against shared Zod schemas; the SDK is generated from the resulting OpenAPI spec."
      />

      <Prose>
        <p>
          Every route validates its request and response against shared Zod
          schemas. Those schemas produce an OpenAPI spec, and the typed SDK is
          generated from that spec — so the API, docs, and client never drift.
        </p>
        <h2>Interactive reference</h2>
        <p>
          A running API serves an interactive OpenAPI reference at{' '}
          <code>/docs</code>. Point it at your installation to explore and try
          every endpoint against live data.
        </p>
        <h2>Common endpoints</h2>
      </Prose>

      <div className="mt-5 overflow-hidden rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Method</th>
              <th className="px-4 py-2.5 font-medium">Path</th>
              <th className="hidden px-4 py-2.5 font-medium sm:table-cell">
                Description
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {endpoints.map((e) => (
              <tr key={`${e.method}-${e.path}`} className="bg-card">
                <td className="px-4 py-3">
                  <span
                    className={`font-mono text-xs font-semibold ${methodTone[e.method] ?? 'text-foreground'}`}
                  >
                    {e.method}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-foreground/90">
                  {e.path}
                </td>
                <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                  {e.desc}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Prose className="mt-8">
        <h2>Using the SDK</h2>
        <p>
          The generated SDK mirrors these routes with full type safety, including
          request payloads and response shapes.
        </p>
      </Prose>
      <div className="mt-5">
        <CodeBlock
          code={sdkExample}
          filename="usage.ts"
          language="typescript"
        />
      </div>

      <DocsPager
        prev={{ title: 'Project structure', href: '/docs/project-structure' }}
      />
    </article>
  )
}
