import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GithubIcon } from '@/components/logo'
import { CodeBlock } from '@/components/code-block'
import { siteConfig } from '@/lib/site'

export function Cta() {
  return (
    <section className="border-t border-border/70 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="rounded-2xl border border-border bg-card px-6 py-14 text-center sm:px-12">
          <h2 className="mx-auto max-w-[35ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Spin up your own LMS in one command
          </h2>
          <p className="mx-auto mt-4 max-w-[48ch] text-lg text-pretty text-muted-foreground">
            Create a standalone installation that owns its config and plugins, and
            deploys anywhere Node and Postgres run.
          </p>

          <div className="mx-auto mt-8 max-w-md">
            <CodeBlock code={siteConfig.installCommand} language="bash" />
          </div>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" render={<Link href="/docs" />}>
              Read the docs
              <ArrowRight className="size-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              render={<a href={siteConfig.githubUrl} target="_blank" rel="noreferrer" />}
            >
              <GithubIcon className="size-4" />
              Star on GitHub
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
