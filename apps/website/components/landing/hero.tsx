import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
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
    <section className="pt-20 pb-16 lg:pt-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-x-8 gap-y-12 lg:grid-cols-[21fr_20fr]">
          <div>
            <h1 className="max-w-[24ch] text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              The API-first LMS for building{' '}
              <span className="text-primary dark:text-foreground">
                learning systems
              </span>
            </h1>

            <p className="mt-6 max-w-[48ch] text-lg text-pretty text-muted-foreground">
              A headless, composable learning platform in modern TypeScript.
              Use it out-of-the-box or swap with your own adapters. Build whatever frontend you want.
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

            <div className="mt-8 font-mono text-sm">
              <code className="inline-block rounded-lg border border-border bg-card px-4 py-2.5 text-foreground/90">
                <span className="text-muted-foreground">$</span>{' '}
                {siteConfig.installCommand}
              </code>
            </div>
          </div>

          <CodeBlock
            code={sdkSnippet}
            filename="app/lib/lms.ts"
            language="typescript"
          />
        </div>
      </div>
    </section>
  )
}
