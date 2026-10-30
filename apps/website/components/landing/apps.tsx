import Image from "next/image";
import { GraduationCap, LayoutDashboard, PencilRuler } from "lucide-react";
import { AppWindow } from "@/components/landing/app-window";
import { Backdrop } from "@/components/landing/backdrop";
import { SectionHead } from "@/components/landing/section-head";

const cards = [
  {
    icon: LayoutDashboard,
    title: "Admin back-office",
    body: "Courses, students, entitlements, automations and reporting, for every organization you run.",
  },
  {
    icon: GraduationCap,
    title: "Student portal",
    body: "Where students sign in, pick up where they left off, and work through their courses.",
  },
  {
    icon: PencilRuler,
    title: "Rich content editor",
    body: "A Notion-style activity editor powered by Plate.js, shipped as a plugin you can replace.",
  },
];

export function Apps() {
  return (
    <section id="apps" className="container-page mt-28 scroll-mt-24 md:mt-40">
      <SectionHead
        label="Apps"
        title="Ships with an admin and a student portal."
        lede="Two Next.js apps built on the public SDK, like any frontend you'd write. Run them as they are, change them, or read them as a reference."
        link={{ href: "/docs/project-structure", label: "See the project structure" }}
      />

      <div className="relative mt-12 overflow-hidden rounded-[22px] ring-1 ring-line md:mt-16">
        <Backdrop
          name="sky"
          sizes="(min-width: 1440px) 1360px, 100vw"
          style={{ objectPosition: "50% 70%" }}
        />
        <div className="relative px-4 pt-10 md:px-14 md:pt-16">
          <div className="relative mx-auto max-w-[1100px] pb-10 md:pb-24">
            <AppWindow title="admin" className="md:w-[78%]">
              <Image
                src="/screenshots/admin-course.jpg"
                alt="Admin back-office showing a course curriculum"
                width={1568}
                height={714}
                sizes="(min-width: 1024px) 860px, 100vw"
                className="w-full"
              />
            </AppWindow>
            <AppWindow
              title="student"
              tone="dark"
              className="mt-3 md:absolute md:right-0 md:bottom-0 md:mt-0 md:w-[56%]"
            >
              <Image
                src="/screenshots/student-library.jpg"
                alt="Student portal library showing a course in progress"
                width={1568}
                height={714}
                sizes="(min-width: 1024px) 620px, 100vw"
                className="w-full"
              />
            </AppWindow>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {cards.map((c) => (
          <div key={c.title} className="rounded-[18px] bg-surface-2 p-6 ring-1 ring-line">
            <c.icon aria-hidden className="size-[18px] text-foreground" />
            <h3 className="mt-4 text-[16px] font-semibold tracking-[-0.015em] text-foreground">
              {c.title}
            </h3>
            <p className="mt-1.5 text-[14.5px] leading-relaxed text-pretty text-muted-foreground">
              {c.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
