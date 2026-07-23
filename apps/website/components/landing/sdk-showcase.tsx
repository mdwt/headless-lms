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
    <section id="sdk" className="scroll-mt-20 border-t border-border/70 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-x-8 gap-y-12 lg:grid-cols-2 lg:items-center">
          <div className="order-1 lg:order-1">
            <h2 className="max-w-[35ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              One source of truth, from schema to SDK
            </h2>
            <p className="mt-4 max-w-[48ch] text-lg text-pretty text-muted-foreground">
              Define a route once with Zod schemas. Headless LMS validates every request and
              response, generates the OpenAPI spec, and produces a fully typed SDK you can build any
              frontend on.
            </p>
            <ul role="list" className="mt-8 space-y-3">
              {benefits.map((b) => (
                <li key={b} className="flex gap-3 text-base/7 text-muted-foreground sm:text-sm/6">
                  <CheckCircle2 aria-hidden className="size-4 h-lh shrink-0 text-primary" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <div className="order-2 lg:order-2">
            <CodeBlock code={routeSnippet} filename="routes/courses.ts" language="typescript" />
          </div>
        </div>
      </div>
    </section>
  );
}
