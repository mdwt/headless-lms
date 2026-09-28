import type { CSSProperties } from "react";
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

const audiences = [
  { label: "indie devs", color: "var(--brand-violet)", tilt: "-2deg" },
  { label: "vibe coders", color: "var(--brand-coral)", tilt: "1.5deg" },
  { label: "course creators", color: "var(--brand-mint)", tilt: "-1deg" },
  { label: "SaaS teams", color: "var(--brand-violet)", tilt: "2deg" },
];

export function Hero() {
  return (
    <section className="pt-16 pb-16 lg:pt-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-x-10 gap-y-12 lg:grid-cols-[21fr_20fr]">
          <div>
            <ul role="list" aria-label="Built for" className="mb-6 flex flex-wrap gap-2">
              {audiences.map((a) => (
                <li
                  key={a.label}
                  className="chip"
                  style={{ "--chip": a.color, "--tilt": a.tilt } as CSSProperties}
                >
                  {a.label}
                </li>
              ))}
            </ul>
            <h1 className="max-w-[20ch] text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl lg:text-[4rem]">
              The API-first LMS for building <span className="text-primary">learning systems</span>
            </h1>

            <p className="mt-6 max-w-[48ch] text-lg text-pretty text-muted-foreground">
              A headless, composable learning platform in modern TypeScript. Host your own courses,
              use it out-of-the-box or swap in your own adapters. Build whatever frontend you want.
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
              <span className="inline-flex items-center gap-3 rounded-xl border-[1.5px] border-dashed border-brand-mint/60 bg-card py-1.5 pr-1.5 pl-4 text-foreground/90">
                <code>
                  <span className="text-chart-3 select-none">$</span> {siteConfig.installCommand}
                </code>
                <CopyButton code={siteConfig.installCommand} />
              </span>
            </div>
          </div>

          <CodeBlock
            code={sdkSnippet}
            filename="app/lib/lms.ts"
            language="typescript"
            className="shadow-[0_24px_48px_-28px_var(--brand-violet)] lg:rotate-1"
          />
        </div>
      </div>
    </section>
  );
}
