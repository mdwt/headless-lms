import {
  BarChart3,
  Bot,
  BookOpen,
  Braces,
  Building2,
  Database,
  FileCode2,
  HardDrive,
  KeyRound,
  Mail,
  Plug,
  ShieldCheck,
  Webhook,
  Workflow,
} from "lucide-react";

const items = [
  [BookOpen, "Courses"],
  [BarChart3, "Progress tracking"],
  [KeyRound, "Entitlements"],
  [Building2, "Multi-tenant orgs"],
  [FileCode2, "Typed SDK"],
  [Braces, "OpenAPI"],
  [Bot, "MCP over OAuth"],
  [Webhook, "Signed webhooks"],
  [Plug, "Plugins"],
  [Database, "Postgres"],
  [HardDrive, "S3 · MinIO"],
  [Mail, "Resend · SES"],
  [Workflow, "Hatchet workflows"],
  [ShieldCheck, "Better Auth"],
] as const;

export function Strip() {
  return (
    <section className="mt-10 md:mt-14" aria-label="What ships in the box">
      <div className="marquee relative overflow-hidden">
        <div className="marquee-track flex w-max gap-2.5">
          {[...items, ...items].map(([Icon, label], i) => (
            <span
              key={i}
              aria-hidden={i >= items.length ? "true" : undefined}
              className="flex h-10 items-center gap-2 rounded-full bg-surface-2 px-4 text-[13.5px] text-body ring-1 ring-line"
            >
              <Icon aria-hidden className="size-[15px] text-subtle" />
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
