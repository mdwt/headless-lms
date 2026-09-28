import type { CSSProperties } from "react";
import { Layers, ShieldCheck, Boxes, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconTile } from "@/components/landing/icon-tile";

const layers = [
  {
    label: "Your apps",
    detail: (
      <>
        Admin | Student portal | <span className="text-foreground">Your frontend</span> |{" "}
        <span className="text-foreground">AI agents</span>
      </>
    ),
    core: false,
  },
  {
    label: "One API for every client",
    detail: "OpenAPI · generated SDK",
    core: false,
  },
  {
    label: "Domain core",
    detail: "Courses · Progress · Entitlements · Orgs",
    core: true,
  },
];

const adapterSlots = ["Database", "Storage", "Email", "Auth"];

const principles = [
  {
    icon: Layers,
    title: "Layered by design",
    body: "A framework-free domain core allows you to use any tech stack you want.",
  },
  {
    icon: Boxes,
    title: "Composable installations",
    body: "An installation composes what it wants with sane defaults. Swap in your own storage, email, and auth adapters freely.",
  },
  {
    icon: ShieldCheck,
    title: "Secure by default",
    body: "Authentication, org-scoped multi-tenancy, encrypted credential storage, and validated I/O throughout.",
  },
];

function Connector({ dashed = false }: { dashed?: boolean }) {
  return (
    <div className="flex flex-col items-center py-0.5" aria-hidden="true">
      <div
        className={cn(
          "h-3 w-px",
          dashed ? "border-l border-dashed border-primary/50" : "bg-primary/50",
        )}
      />
      <ChevronDown className="-mt-1 size-3 text-primary/60" />
    </div>
  );
}

export function Architecture() {
  return (
    <section id="architecture" className="scroll-mt-20 border-t border-border/70 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-x-8 gap-y-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="max-w-[35ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Bring your own adapters
            </h2>
            <p className="mt-4 max-w-[48ch] text-lg text-pretty text-muted-foreground">
              The backend ships as two libraries:{" "}
              <code className="rounded-md bg-card px-1.5 py-0.5 font-mono text-foreground/90">
                @headless-lms/core
              </code>
              , a framework-free domain, and{" "}
              <code className="rounded-md bg-card px-1.5 py-0.5 font-mono text-foreground/90">
                @headless-lms/server
              </code>
              , the Fastify layer that wires core to the adapters you choose.
            </p>

            <dl className="mt-8 space-y-6">
              {principles.map((p, i) => (
                <div key={p.title} className="flex gap-4">
                  <IconTile icon={p.icon} index={i} />
                  <div>
                    <dt className="font-display text-lg font-semibold">{p.title}</dt>
                    <dd className="mt-1 text-base/7 text-pretty text-muted-foreground sm:text-sm/6">
                      {p.body}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>

          <div>
            {layers.map((layer) => (
              <div key={layer.label}>
                <div
                  className={cn(
                    "rounded-2xl border p-5",
                    layer.core ? "border-primary/40 bg-primary/5" : "border-border bg-card",
                  )}
                >
                  <p className="font-medium">{layer.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{layer.detail}</p>
                </div>
                <Connector dashed={layer.core} />
              </div>
            ))}

            <div className="rounded-2xl border border-border p-5">
              <p className="font-medium">Swappable adapters</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {adapterSlots.map((slot, i) => (
                  <span
                    key={slot}
                    className="chip"
                    style={
                      {
                        "--chip": [
                          "var(--brand-violet)",
                          "var(--brand-coral)",
                          "var(--brand-mint)",
                        ][i % 3],
                        "--tilt": `${i % 2 ? 1.5 : -1.5}deg`,
                      } as CSSProperties
                    }
                  >
                    {slot}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
