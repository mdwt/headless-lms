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
      className="scroll-mt-20 border-t border-border/70 bg-secondary/20"
    >
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              A backend that ships as a library
            </h2>
            <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
              The backend ships as{' '}
              <code className="rounded bg-card px-1.5 py-0.5 font-mono text-sm text-foreground/90">
                @headless-lms/server
              </code>
              : a framework-free domain core behind a Fastify HTTP layer. Every
              client — including AI agents — talks to the same domain layer.
            </p>

            <div className="mt-8 space-y-5">
              {principles.map((p) => (
                <div key={p.title} className="flex gap-4">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-primary">
                    <p.icon className="size-4.5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium">{p.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {p.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {layers.map((layer) => (
              <div
                key={layer.label}
                className="rounded-xl border border-border bg-card p-5"
              >
                <p className={`text-sm font-medium ${layer.tone}`}>
                  {layer.label}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {layer.items.map((item) => (
                    <span
                      key={item}
                      className="rounded-md border border-border bg-secondary/50 px-2.5 py-1 text-xs text-muted-foreground"
                    >
                      {item}
                    </span>
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
