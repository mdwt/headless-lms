import { LayoutDashboard, GraduationCap, Bot, ArrowUpRight } from 'lucide-react'
import { CodeBlock } from '@/components/code-block'

const mcpSnippet = `# AI agents connect over OAuth and operate the LMS
# through the same domain layer as every other client.

POST /mcp
Authorization: Bearer <oauth-token>

> tools/call enroll_student
  { "orgId": "...", "studentId": "...", "courseId": "..." }`

export function AppsMcp() {
  return (
    <section
      id="mcp"
      className="scroll-mt-20 border-t border-border/70 bg-secondary/20"
    >
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Reference apps and an AI-native surface
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            Ships with a Next.js admin back-office and student portal built on the
            public API — plus an MCP endpoint so AI agents are first-class clients.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-secondary/50 text-primary">
                <LayoutDashboard className="size-5" />
              </div>
              <h3 className="mt-4 flex items-center gap-1.5 text-base font-medium">
                Admin back-office
                <ArrowUpRight className="size-4 text-muted-foreground" />
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                A Next.js dashboard for courses, students, entitlements, and
                reporting — built entirely on the public API.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-secondary/50 text-primary">
                <GraduationCap className="size-5" />
              </div>
              <h3 className="mt-4 flex items-center gap-1.5 text-base font-medium">
                Student portal
                <ArrowUpRight className="size-4 text-muted-foreground" />
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                A Next.js app where students log in and take their courses, built
                on the typed SDK.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2">
              <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-secondary/50 text-primary">
                <Bot className="size-5" />
              </div>
              <h3 className="text-base font-medium">MCP endpoint</h3>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Agents authenticate over OAuth and operate the LMS through the exact
              same domain layer as the SDK and dashboards — no parallel code path.
            </p>
            <div className="mt-5">
              <CodeBlock code={mcpSnippet} language="http" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
