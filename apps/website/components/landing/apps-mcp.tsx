import { LayoutDashboard, GraduationCap, Bot } from 'lucide-react'
import { CodeBlock } from '@/components/code-block'

const mcpSnippet = `# AI agents connect over OAuth and operate the LMS
# through the same domain layer as every other client.

POST /mcp
Authorization: Bearer <oauth-token>

> tools/call enroll_student
  { "orgId": "...", "studentId": "...", "courseId": "..." }`

const surfaces = [
  {
    icon: LayoutDashboard,
    title: 'Admin back-office',
    body: 'A Next.js dashboard for courses, students, entitlements, and reporting — built entirely on the public API.',
  },
  {
    icon: GraduationCap,
    title: 'Student portal',
    body: 'A Next.js app where students log in and take their courses, built on the typed SDK.',
  },
  {
    icon: Bot,
    title: 'MCP endpoint',
    body: 'Agents authenticate over OAuth and operate the LMS through the exact same domain layer as the SDK and dashboards — no parallel code path.',
  },
]

export function AppsMcp() {
  return (
    <section
      id="mcp"
      className="scroll-mt-20 border-t border-border/70 bg-secondary/20 py-20"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-x-8 gap-y-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="max-w-[35ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Reference apps and an AI-native surface
            </h2>
            <p className="mt-4 max-w-[48ch] text-lg text-pretty text-muted-foreground">
              Ships with a Next.js admin back-office and student portal built on
              the public API — plus an MCP endpoint so AI agents are first-class
              clients.
            </p>

            <dl className="mt-8 space-y-6">
              {surfaces.map((s) => (
                <div key={s.title} className="flex gap-3">
                  <s.icon aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <dt className="font-medium">{s.title}</dt>
                    <dd className="mt-1 text-base/7 text-pretty text-muted-foreground sm:text-sm/6">
                      {s.body}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>

          <CodeBlock code={mcpSnippet} filename="mcp.http" language="http" />
        </div>
      </div>
    </section>
  )
}
