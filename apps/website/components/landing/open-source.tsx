import { Blocks, Terminal } from "lucide-react";
import { SectionHead } from "@/components/landing/section-head";
import { MiniCard, Tile } from "@/components/landing/tile";

const transcript = [
  ["┌", "create-headless-lms"],
  ["◇", "Project name · my-lms"],
  ["◇", "Database · Postgres via docker-compose"],
  ["◇", "File storage · Bundled MinIO via docker-compose"],
  ["◇", "API port · 8000"],
  ["◇", "Created my-lms/"],
  ["└", "API will listen on http://localhost:8000 — docs at /docs"],
] as const;

const slots = [
  { slot: "Email", options: ["Resend", "SES"] },
  { slot: "Templates", options: ["React Email"] },
  { slot: "Storage", options: ["MinIO", "S3"] },
  { slot: "Workflows", options: ["Hatchet", "Inline"] },
];

export function OpenSource() {
  return (
    <section id="open-source" className="container-page mt-28 scroll-mt-24 md:mt-40">
      <SectionHead
        label="Open source"
        title="Yours to read, run and change."
        lede="MIT licensed, with a framework-free domain core. Scaffold an installation with one command and deploy it anywhere Node and Postgres run."
      />

      <div className="mt-12 grid gap-3 md:mt-16 lg:grid-cols-12">
        <Tile
          className="lg:col-span-6"
          icon={Terminal}
          title="One command to a running LMS"
          body="The scaffolder creates a standalone installation that owns its config and plugins, with Postgres and MinIO in docker-compose if you want them."
          painting="golden"
          focus="50% 60%"
          href="/docs/self-hosting"
        >
          <div className="p-5 sm:p-9">
            <div className="overflow-hidden rounded-[12px] bg-[#0a0a0a]/92 font-mono text-[12px] leading-[1.95] shadow-[0_40px_80px_-30px_rgb(60_30_0/0.6)] ring-1 ring-white/10 backdrop-blur">
              <div className="flex h-9 items-center gap-1.5 border-b border-white/10 px-4">
                <i className="size-2.5 rounded-full bg-[#ff5f57]" />
                <i className="size-2.5 rounded-full bg-[#febc2e]" />
                <i className="size-2.5 rounded-full bg-[#28c840]" />
                <span className="ml-2 text-[10.5px] text-white/40">~/projects</span>
              </div>
              <div className="overflow-x-auto p-5 text-left whitespace-nowrap">
                <div className="flex gap-2">
                  <span className="text-white/40">$</span>
                  <span className="text-white">npm create headless-lms</span>
                </div>
                <div className="mt-2">
                  {transcript.map(([mark, line]) => (
                    <div key={line} className="text-white/70">
                      <span className={mark === "◇" ? "text-[#22c55e]" : "text-white/40"}>
                        {mark}
                      </span>{" "}
                      {line}
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-white">
                  <span className="text-white/40">$</span> cd my-lms && docker compose up -d
                </div>
                <div className="text-white">
                  <span className="text-white/40">$</span> pnpm migrate && pnpm dev
                  <span className="caret" />
                </div>
              </div>
            </div>
          </div>
        </Tile>

        <Tile
          className="lg:col-span-6"
          icon={Blocks}
          title="Bring your own adapters"
          body={
            <>
              <code className="font-mono text-[13px] text-foreground">@headless-lms/core</code> is a
              framework-free domain. Every adapter slot is optional and sits behind a port you can
              implement yourself.
            </>
          }
          skin="graph"
          href="/docs/adapters"
        >
          <div className="m-5 divide-y divide-line overflow-hidden rounded-[10px] bg-raised shadow-card ring-1 ring-line md:m-7">
            {slots.map((s) => (
              <div key={s.slot} className="flex items-center gap-3 px-4 py-3.5">
                <span className="w-24 shrink-0 font-mono text-[11.5px] tracking-[0.04em] text-muted-foreground uppercase">
                  {s.slot}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {s.options.map((o) => (
                    <span
                      key={o}
                      className="inline-flex h-6 items-center rounded-full bg-surface-2 px-2.5 text-[12px] text-body ring-1 ring-line"
                    >
                      {o}
                    </span>
                  ))}
                  <span className="inline-flex h-6 items-center rounded-full border border-dashed border-line-strong px-2.5 text-[12px] text-subtle">
                    your own
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Tile>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniCard title="MIT" body="Read it, change it, run it anywhere." />
        <MiniCard title="TypeScript" body="One language from domain core to SDK." />
        <MiniCard title="Node and Postgres" body="All you need to start. Add adapters as you go." />
        <MiniCard
          title="Secure by default"
          body="Org-scoped tenancy, encrypted credentials, validated I/O."
        />
      </div>
    </section>
  );
}
