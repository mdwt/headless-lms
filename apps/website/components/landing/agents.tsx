import { Bot, ChevronDown, GraduationCap, LayoutDashboard, MonitorSmartphone } from "lucide-react";
import { Backdrop } from "@/components/landing/backdrop";
import { ArrowLink } from "@/components/landing/section-head";
import { cn } from "@/lib/utils";

const clients = [
  { icon: LayoutDashboard, title: "Admin back-office", via: "SDK" },
  { icon: GraduationCap, title: "Student portal", via: "SDK" },
  { icon: MonitorSmartphone, title: "Your frontend", via: "SDK or HTTP" },
  { icon: Bot, title: "AI agents", via: "MCP · OAuth", agent: true },
];

const adapters = ["Resend · SES", "React Email", "MinIO · S3", "Hatchet"];

function Glass({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-[14px] bg-white/70 shadow-[0_20px_40px_-24px_rgb(40_20_110/0.45)] ring-1 ring-white/70 backdrop-blur-md dark:bg-[#141416]/70 dark:ring-white/10",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Down() {
  return (
    <div className="flex justify-center py-1.5 text-[#3b2f80]/55" aria-hidden="true">
      <ChevronDown className="size-5" />
    </div>
  );
}

export function Agents() {
  return (
    <section id="mcp" className="container-page mt-28 scroll-mt-24 md:mt-40">
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <span
            aria-hidden="true"
            className="absolute -inset-10 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--brand-violet)_22%,transparent),transparent)]"
          />
          <span className="relative flex size-16 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#9d85ff,#6a4bff_60%,#4a30c9)] text-white shadow-[0_12px_30px_-10px_#6a4bff]">
            <Bot className="size-7" strokeWidth={1.75} />
          </span>
        </div>
        <div className="label mt-6 text-brand-violet">AI agents</div>
        <h2 className="h-section mt-4">Agents are first-class clients.</h2>
        <p className="lede mt-5 max-w-[640px]">
          An MCP endpoint lets agents connect over OAuth and operate the LMS through the same domain
          layer as the SDK and the dashboards. One API, one set of rules, every client.
        </p>
      </div>

      <div className="relative mt-12 overflow-hidden rounded-[22px] ring-1 ring-line md:mt-16">
        <Backdrop name="haze" sizes="(min-width: 1440px) 1360px, 100vw" />
        <div className="relative mx-auto max-w-[920px] px-4 py-10 md:px-8 md:py-16">
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {clients.map((c) => (
              <Glass
                key={c.title}
                className={cn(
                  "flex flex-col items-start gap-3 p-4 text-left",
                  c.agent && "ring-2 ring-brand-violet/60 dark:ring-brand-violet/60",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-[8px] ring-1",
                    c.agent
                      ? "bg-brand-violet text-white ring-brand-violet"
                      : "bg-surface-2 text-subtle ring-line",
                  )}
                >
                  <c.icon className="size-4" />
                </span>
                <div>
                  <div className="text-[14px] font-medium text-foreground">{c.title}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{c.via}</div>
                </div>
              </Glass>
            ))}
          </div>
          <Down />
          <Glass className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
            <div className="text-[14.5px] font-medium text-foreground">
              One API for every client
            </div>
            <div className="font-mono text-[11.5px] text-muted-foreground">
              Zod contract · OpenAPI · generated SDK
            </div>
          </Glass>
          <Down />
          <Glass className="px-5 py-4 ring-2 ring-white">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[14.5px] font-medium text-foreground">
                Domain core{" "}
                <span className="font-mono text-[12px] text-muted-foreground">
                  @headless-lms/core
                </span>
              </div>
              <div className="font-mono text-[11.5px] text-muted-foreground">
                Courses · Progress · Entitlements · Orgs
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-4">
              <span className="mr-1 self-center text-[12.5px] text-muted-foreground">Adapters</span>
              {adapters.map((a) => (
                <span
                  key={a}
                  className="inline-flex h-7 items-center rounded-full bg-surface-2 px-3 text-[12.5px] text-body ring-1 ring-line"
                >
                  {a}
                </span>
              ))}
            </div>
          </Glass>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 px-1">
        <p className="text-[14px] text-muted-foreground">
          The admin and student apps are SDK consumers like any other frontend, built entirely on
          the public API.
        </p>
        <ArrowLink href="/docs/architecture">How the layers fit</ArrowLink>
      </div>
    </section>
  );
}
