import Image from "next/image";
import { LayoutDashboard, GraduationCap, Bot, PaintbrushIcon } from "lucide-react";
import { IconTile } from "@/components/landing/icon-tile";

const surfaces = [
  {
    icon: LayoutDashboard,
    title: "Admin back-office",
    body: "A Next.js dashboard for courses, students, entitlements, and reporting — built entirely on the public API.",
  },
  {
    icon: PaintbrushIcon,
    title: "Rich course content builder",
    body: "Create engaging course content with our default content builder (powered by Plate.js).",
  },
  {
    icon: GraduationCap,
    title: "Student portal",
    body: "A Next.js app where students log in and take their courses, built on the typed SDK.",
  },
  {
    icon: Bot,
    title: "MCP endpoint",
    body: "Agents authenticate and operate the LMS through the exact same domain layer as the SDK and dashboards.",
  },
];

export function AppsMcp() {
  return (
    <section id="mcp" className="scroll-mt-20 border-t border-border/70 bg-secondary/20 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-x-8 gap-y-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="max-w-[35ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Works out of the box
            </h2>
            <p className="mt-4 max-w-[48ch] text-lg text-pretty text-muted-foreground">
              Ships with a Next.js admin back-office and student portal built on the public API,
              plus an MCP endpoint so AI agents are first-class clients.
            </p>

            <dl className="mt-8 space-y-6">
              {surfaces.map((s, i) => (
                <div key={s.title} className="flex gap-4">
                  <IconTile icon={s.icon} index={i} />
                  <div>
                    <dt className="font-display text-lg font-semibold">{s.title}</dt>
                    <dd className="mt-1 text-base/7 text-pretty text-muted-foreground sm:text-sm/6">
                      {s.body}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>

          <div className="space-y-4 lg:relative lg:space-y-0 lg:pb-20">
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <Image
                src="/screenshots/admin-course.jpg"
                alt="Admin back-office showing a course curriculum with modules and lessons"
                width={1568}
                height={714}
                className="w-full"
              />
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-card lg:absolute lg:right-0 lg:bottom-0 lg:w-[58%]">
              <Image
                src="/screenshots/student-library.jpg"
                alt="Student portal library showing enrolled courses with progress"
                width={1568}
                height={714}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
