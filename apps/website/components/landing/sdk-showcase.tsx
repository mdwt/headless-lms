import { CheckCircle2 } from 'lucide-react'
import { CodeBlock } from '@/components/code-block'

const routeSnippet = `// Routes validate against shared Zod schemas
export const createCourse = defineRoute({
  method: "POST",
  path: "/orgs/:orgId/courses",
  input: CourseCreateSchema,   // validated request
  output: CourseSchema,        // validated response
  handler: async ({ input, ctx }) => {
    return ctx.courses.create(input)
  },
})

// The OpenAPI spec + SDK are generated from these.
// pnpm gen:sdk`

const benefits = [
  'Requests and responses validated against shared Zod schemas',
  'OpenAPI spec generated from your routes',
  'Typed SDK generated from the resulting spec',
  'Interactive OpenAPI reference at /docs on a running API',
]

export function SdkShowcase() {
  return (
    <section id="sdk" className="scroll-mt-20 border-t border-border/70">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div className="order-2 lg:order-1">
            <CodeBlock
              code={routeSnippet}
              filename="routes/courses.ts"
              language="typescript"
            />
          </div>

          <div className="order-1 lg:order-2">
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              One source of truth, from schema to SDK
            </h2>
            <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
              Define a route once with Zod schemas. Headless LMS validates every
              request and response, generates the OpenAPI spec, and produces a
              fully typed SDK you can build any frontend on.
            </p>
            <ul className="mt-8 space-y-3">
              {benefits.map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
                  <span className="text-sm leading-relaxed text-muted-foreground">
                    {b}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
