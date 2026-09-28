import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GithubIcon } from "@/components/logo";
import { CodeBlock } from "@/components/code-block";
import { CopyButton } from "@/components/copy-button";
import { siteConfig } from "@/lib/site";

const sdkSnippet = `import {
  Content, Entitlements, Organizations, configureSdk,
} from "@headless-lms/sdk"

configureSdk({ baseUrl: "https://lms.acme.dev" })

// Fully typed against the OpenAPI spec
const course = await Content.createCourse({
  title: "Intro to Distributed Systems",
})

const { rows: [student] } =
  await Organizations.listStudents({ search: "ada" })

await Entitlements.grantEntitlement({
  orgUserId: student.id,
  contentId: course.id,
  expiresAt: null,
})`;

export function Hero() {
  return (
    <section className="pt-20 pb-16 lg:pt-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-x-8 gap-y-12 lg:grid-cols-[21fr_20fr]">
          <div>
            <h1 className="max-w-[24ch] text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              The API-first LMS for building <span className="text-primary">learning systems</span>
            </h1>

            <p className="mt-6 max-w-[48ch] text-lg text-pretty text-muted-foreground">
              A headless, composable learning platform in modern TypeScript. Use it out-of-the-box
              or swap with your own adapters. Build whatever frontend you want.
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
                Star on GitHub
              </Button>
            </div>

            <div className="mt-8 font-mono text-sm">
              <span className="inline-flex items-center gap-3 rounded-lg border border-border bg-card py-1.5 pr-1.5 pl-4 text-foreground/90">
                <code>
                  <span className="text-muted-foreground select-none">$</span>{" "}
                  {siteConfig.installCommand}
                </code>
                <CopyButton code={siteConfig.installCommand} />
              </span>
            </div>
          </div>

          <CodeBlock code={sdkSnippet} filename="app/lib/lms.ts" language="typescript" />
        </div>
      </div>
    </section>
  );
}
