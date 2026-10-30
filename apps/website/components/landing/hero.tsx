import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { GithubIcon } from "@/components/logo";
import { CopyCommand } from "@/components/copy-command";
import { Code } from "@/components/code-block";
import { AppWindow } from "@/components/landing/app-window";
import { Backdrop } from "@/components/landing/backdrop";
import { siteConfig } from "@/lib/site";

const snippet = `const course = await Content.createCourse({
  title: "Intro to Distributed Systems",
})

await Entitlements.grantEntitlement({
  orgUserId: student.id,
  contentId: course.id,
  expiresAt: null,
})`;

export function Hero() {
  return (
    <section className="px-2 pt-2 md:px-3 md:pt-3">
      <div className="relative isolate overflow-hidden rounded-[22px] md:rounded-[28px]">
        <Backdrop
          name="towersHero"
          priority
          sizes="100vw"
          className="-z-10"
          style={{ objectPosition: "50% 0%" }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(42%_34%_at_50%_36%,rgb(16_46_116/0.42),transparent_80%),linear-gradient(180deg,rgb(16_46_116/0.3)_0%,transparent_40%)]"
        />

        <div className="container-page pt-16 text-center text-white md:pt-24">
          <a
            href={siteConfig.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex h-8 items-center gap-2 rounded-full bg-white/12 pr-3 pl-1 text-[12.5px] text-white/90 ring-1 ring-white/25 backdrop-blur-md transition-colors hover:bg-white/20"
          >
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-white px-2.5 text-[11.5px] font-medium text-[#0a0a0a]">
              <GithubIcon className="size-3" />
              {siteConfig.license}
            </span>
            <span className="sm:hidden">Self-host anywhere</span>
            <span className="hidden sm:inline">Self-host anywhere Node and Postgres run</span>
            <ArrowUpRight className="size-3 text-white/60 transition-transform group-hover:translate-x-px group-hover:-translate-y-px" />
          </a>

          <h1 className="mx-auto mt-7 max-w-[15ch] text-[44px] leading-[1] font-semibold tracking-[-0.045em] text-balance [text-shadow:0_2px_30px_rgb(10_30_80/0.35)] sm:text-[68px] lg:max-w-[17ch] lg:text-[88px]">
            The API-first LMS for building learning systems.
          </h1>
          <p className="mx-auto mt-6 max-w-[760px] text-[18px] leading-[1.5] text-balance text-white [text-shadow:0_1px_2px_rgb(10_30_80/0.35),0_2px_24px_rgb(10_30_80/0.5)] md:text-[21px]">
            Courses, progress, entitlements and multi-tenancy as a typed TypeScript API. Use the
            admin and student apps it ships with, or build any frontend you want.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/docs"
              className="inline-flex h-[46px] items-center gap-2 rounded-[6px] bg-white px-5 text-[15px] font-medium text-[#0a0a0a] shadow-[0_10px_30px_-10px_rgb(10_30_80/0.5)] transition-colors hover:bg-white/90"
            >
              Get started
              <ArrowRight className="size-4" />
            </Link>
            <CopyCommand tone="inverse" className="h-[46px] w-full max-w-[360px] text-left" />
          </div>
          <p className="mt-5 font-mono text-[11px] tracking-[0.08em] text-white/85 uppercase [text-shadow:0_1px_10px_rgb(10_30_80/0.6)]">
            MIT licensed · Typed SDK · MCP endpoint
          </p>
        </div>

        <div className="relative mx-auto mt-14 max-w-[1416px] px-3 md:mt-20 md:px-7">
          <div className="relative -mb-[120px] md:-mb-[14%]">
            <AppWindow title="admin · Courses / Design Systems 101">
              <Image
                src="/screenshots/admin-course.jpg"
                alt="Admin back-office showing a course curriculum with modules and activities"
                width={1568}
                height={714}
                priority
                className="w-full"
              />
            </AppWindow>
            <div className="absolute -top-10 right-4 hidden w-[400px] overflow-hidden rounded-[10px] bg-raised shadow-float ring-1 ring-line lg:block xl:right-10 xl:w-[440px]">
              <div className="flex h-9 items-center justify-between border-b border-line bg-surface-2 px-4 font-mono text-[11px] text-subtle">
                <span>app/lib/lms.ts</span>
                <span className="text-chart-3">typed · @headless-lms/sdk</span>
              </div>
              <Code code={snippet} language="typescript" className="px-4 pt-3 pb-4 text-left" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
