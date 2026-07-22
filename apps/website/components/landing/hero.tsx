import Link from 'next/link'
import { ArrowRight, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GithubIcon } from '@/components/logo'
import { CodeBlock } from '@/components/code-block'
import { siteConfig } from '@/lib/site'

const sdkSnippet = `import { createClient } from "@headless-lms/sdk"

const lms = createClient({
  baseUrl: process.env.LMS_URL,
  token: process.env.LMS_TOKEN,
})

// Fully typed against the OpenAPI spec
const course = await lms.courses.create({
  orgId,
  title: "Intro to Distributed Systems",
})

await lms.entitlements.grant({
  studentId,
  courseId: course.id,
})`

export function Hero() {
  return (
    <section>
      <div className="mx-auto max-w-6xl px-4 pt-20 pb-16 sm:px-6 lg:pt-28">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Star className="size-4 text-primary" />
              Open source and MIT licensed
            </div>

            <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              The API-first LMS for building{' '}
              <span className="text-primary">learning systems</span>.
            </h1>

            <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
              A headless, composable learning platform in modern TypeScript.
              Fastify, Drizzle, and Zod under the hood. Org-scoped multi-tenancy,
              a typed SDK, and swappable adapters. Build whatever frontend you want.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" render={<Link href="/docs" />}>
                Get started
                <ArrowRight className="size-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                render={<a href={siteConfig.githubUrl} target="_blank" rel="noreferrer" />}
              >
                <GithubIcon className="size-4" />
                View on GitHub
              </Button>
            </div>

            <div className="mt-8 flex items-center gap-3">
              <code className="rounded-lg border border-border bg-card px-4 py-2.5 font-mono text-sm text-foreground/90">
                <span className="text-muted-foreground">$</span>{' '}
                {siteConfig.installCommand}
              </code>
            </div>
          </div>

          <div className="lg:pl-4">
            <CodeBlock
              code={sdkSnippet}
              filename="app/lib/lms.ts"
              language="typescript"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
