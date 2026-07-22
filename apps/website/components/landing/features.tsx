import {
  BookOpen,
  BarChart3,
  KeyRound,
  Building2,
  Plug,
  Bot,
  FileCode2,
  Mail,
  HardDrive,
} from 'lucide-react'

const features = [
  {
    icon: BookOpen,
    title: 'Course builder',
    body: 'Author structured course content; students work through it activity by activity.',
  },
  {
    icon: BarChart3,
    title: 'Progress tracking',
    body: 'Per-student, per-activity completion, rolled up into course progress and reporting.',
  },
  {
    icon: KeyRound,
    title: 'Entitlements',
    body: 'Grant and revoke student access to content with a first-class access model.',
  },
  {
    icon: Building2,
    title: 'Multi-tenant',
    body: 'One deployment serves many orgs. Every student, course, and session is org-scoped.',
  },
  {
    icon: HardDrive,
    title: 'Media & file assets',
    body: 'Object storage with presigned upload and download URLs, behind a swappable adapter.',
  },
  {
    icon: Plug,
    title: 'Integrations',
    body: "Drop a plugin folder into your installation and it's live at startup. Write your own.",
  },
  {
    icon: Bot,
    title: 'MCP endpoint',
    body: 'AI agents connect over OAuth and operate the LMS through the same domain layer.',
  },
  {
    icon: FileCode2,
    title: 'Typed SDK & OpenAPI',
    body: 'Routes validate against shared Zod schemas; the SDK is generated from the spec.',
  },
  {
    icon: Mail,
    title: 'Transactional email',
    body: 'Invitation and auth mail, swappable behind an adapter you control.',
  },
]

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 border-t border-border/70">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            A complete learning platform, headless by design
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            The full domain of an LMS, exposed as a typed API. Compose the pieces
            you need and swap the ones you don&apos;t.
          </p>
        </div>

        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group bg-card p-6 transition-colors hover:bg-accent/40"
            >
              <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-secondary/50 text-primary">
                <feature.icon className="size-5" />
              </div>
              <h3 className="mt-4 text-base font-medium">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {feature.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
