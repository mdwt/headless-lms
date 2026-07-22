import { Layers, ShieldCheck, Boxes } from 'lucide-react'

const layers = [
  {
    label: 'Clients',
    items: ['Admin dashboard', 'Student portal', 'Your frontend', 'AI agents (MCP)'],
    tone: 'text-foreground',
  },
  {
    label: 'HTTP layer — Fastify',
    items: ['Zod-validated requests & responses', 'OpenAPI spec', 'Generated typed SDK'],
    tone: 'text-primary',
  },
  {
    label: 'Domain core — framework-free',
    items: ['Courses', 'Progress', 'Entitlements', 'Orgs & sessions'],
    tone: 'text-foreground',
  },
  {
    label: 'Adapters & persistence',
    items: ['Drizzle / Postgres', 'Object storage', 'Email', 'Plugins'],
    tone: 'text-muted-foreground',
  },
]

const principles = [
  {
    icon: Layers,
    title: 'Layered by design',
    body: 'A framework-free domain core sits behind a Fastify HTTP layer, persisted with Drizzle and Postgres.',
  },
  {
    icon: Boxes,
    title: 'Composable installations',
    body: 'An installation composes what it wants with sane defaults. Swap storage and email adapters freely.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure by default',
    body: 'Authentication, org-scoped multi-tenancy, encrypted credential storage, and validated I/O throughout.',
  },
]

export function Architecture() {
  return (
    <section
      id="architecture"
      className="scroll-mt-20 border-t border-border/70 bg-secondary/20 py-20"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-x-8 gap-y-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="max-w-[35ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              A backend that ships as a library
            </h2>
            <p className="mt-4 max-w-[48ch] text-lg text-pretty text-muted-foreground">
              The backend ships as{' '}
              <code className="rounded-md bg-card px-1.5 py-0.5 font-mono text-foreground/90">
                @headless-lms/server
              </code>
              : a framework-free domain core behind a Fastify HTTP layer. Every
              client — including AI agents — talks to the same domain layer.
            </p>

            <dl className="mt-8 space-y-6">
              {principles.map((p) => (
                <div key={p.title} className="flex gap-3">
                  <p.icon aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <dt className="font-medium">{p.title}</dt>
                    <dd className="mt-1 text-base/7 text-pretty text-muted-foreground sm:text-sm/6">
                      {p.body}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>

          <div className="space-y-3">
            {layers.map((layer) => (
              <div
                key={layer.label}
                className="rounded-2xl border border-border bg-card p-5"
              >
                <p className={`text-sm font-medium ${layer.tone}`}>
                  {layer.label}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {layer.items.map((item) => (
                    <div
                      key={item}
                      className="rounded-md border border-border bg-secondary/50 px-2.5 py-1 text-xs text-muted-foreground"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
