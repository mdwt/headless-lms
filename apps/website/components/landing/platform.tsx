import Image from "next/image";
import { BarChart3, BookOpen, FileCode2, KeyRound, Webhook } from "lucide-react";
import { Code } from "@/components/code-block";
import { AppWindow } from "@/components/landing/app-window";
import { SectionHead } from "@/components/landing/section-head";
import { MiniCard, Tile } from "@/components/landing/tile";

const sdkSnippet = `import {
  Content, Organizations, configureSdk,
} from "@headless-lms/sdk"

configureSdk({ baseUrl: "https://lms.acme.dev" })

const course = await Content.createCourse({
  title: "Intro to Distributed Systems",
})

const { rows: [student] } =
  await Organizations.listStudents({ search: "ada" })`;

const entitlementSnippet = `await Entitlements.grantEntitlement({
  orgUserId: student.id,
  contentId: course.id,
  expiresAt: null,
})

await Entitlements.setEntitlementStatus({
  id: entitlement.id,
  status: "revoked",
})`;

const progressSnippet = `await Progress.reportProgress({
  activity: activity.id,
  reports: [{ completed: true }],
})`;

const webhookSnippet = `POST /hooks/lms
webhook-id: evt_2QZ4mK…
webhook-signature: v1,K5oZfz…

{
  "type": "entitlement.created",
  "version": 1,
  "orgId": "org_2QZ4mK…",
  "data": { … }
}`;

function CodePanel({ code, language }: { code: string; language: "typescript" | "http" }) {
  return (
    <div className="m-5 overflow-hidden rounded-[10px] bg-raised shadow-card ring-1 ring-line md:m-7">
      <Code code={code} language={language} className="px-4 pt-3.5 pb-4" />
    </div>
  );
}

export function Platform() {
  return (
    <section id="platform" className="container-page mt-24 scroll-mt-24 md:mt-32">
      <SectionHead
        label="Platform"
        title="A complete LMS, exposed as a typed API."
        lede="The full domain of a learning platform behind one schema-first API. Compose the pieces you need and swap the ones you don't."
        link={{ href: "/docs/architecture", label: "Read the architecture" }}
      />

      <div className="mt-12 grid gap-3 md:mt-16 lg:grid-cols-12">
        <Tile
          className="lg:col-span-7"
          icon={BookOpen}
          title="Course builder"
          body="Modules and activities with a rich, Notion-style editor. Reorder, publish, and see who has access, from the admin or the API."
          painting="meadow"
          focus="50% 35%"
          href="/docs"
        >
          <div className="px-5 pt-10 sm:px-10 sm:pt-14">
            <AppWindow title="admin · Courses" className="-mb-24 sm:-mb-16">
              <Image
                src="/screenshots/admin-course.jpg"
                alt="The admin course builder with modules and activities"
                width={1568}
                height={714}
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="w-full"
              />
            </AppWindow>
          </div>
        </Tile>

        <Tile
          className="lg:col-span-5"
          icon={FileCode2}
          title="Typed SDK"
          body="Every route validates against a shared Zod contract. The OpenAPI spec and the SDK are generated from it, so they can't drift."
          skin="graph"
          href="/docs/api"
        >
          <CodePanel code={sdkSnippet} language="typescript" />
        </Tile>

        <Tile
          className="lg:col-span-4"
          icon={KeyRound}
          title="Entitlements"
          body="Grant and revoke access to content with one uniform model, the same for every content type."
          skin="graph"
        >
          <CodePanel code={entitlementSnippet} language="typescript" />
        </Tile>

        <Tile
          className="lg:col-span-4"
          icon={BarChart3}
          title="Progress tracking"
          body="Per-student, per-activity completion, rolled up into course progress and reporting."
          frameClassName="bg-[#0e0e10]"
        >
          <div className="px-5 pt-5">
            <Image
              src="/screenshots/student-library.jpg"
              alt="Student portal library showing a course in progress"
              width={1568}
              height={714}
              sizes="(min-width: 1024px) 33vw, 100vw"
              className="w-full rounded-t-[8px] ring-1 ring-white/10"
            />
          </div>
          <div className="border-t border-white/10 bg-[#0e0e10] [--shiki-foreground:rgb(255_255_255/0.85)] [--shiki-token-punctuation:rgb(255_255_255/0.5)]">
            <Code code={progressSnippet} language="typescript" className="px-5 pt-3 pb-4" />
          </div>
        </Tile>

        <Tile
          className="lg:col-span-4"
          icon={Webhook}
          title="Signed webhooks"
          body="Send an organization's events to your endpoint, signed to the Standard Webhooks spec, with retries and reruns."
          skin="graph"
          href="/docs/webhooks"
        >
          <CodePanel code={webhookSnippet} language="http" />
        </Tile>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniCard
          title="Multi-tenant"
          body="One deployment serves many organizations. Every student, course and session is org-scoped."
        />
        <MiniCard
          title="Media and files"
          body="Object storage with presigned upload and download URLs, behind a swappable adapter."
        />
        <MiniCard
          title="Transactional email"
          body="Invitation and auth mail with React Email templates, sent through Resend or SES."
        />
        <MiniCard
          title="Plugins"
          body="Drop a folder into your installation's plugins directory and it's live at startup."
        />
      </div>
    </section>
  );
}
