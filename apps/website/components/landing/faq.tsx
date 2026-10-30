import { Plus } from "lucide-react";
import { SectionLabel } from "@/components/landing/section-head";
import { siteConfig } from "@/lib/site";

export const faqs = [
  {
    q: "Is Headless LMS really open source?",
    a: "Yes. It's MIT licensed and developed in public on GitHub. There is no hosted edition and no closed tier with extra features.",
  },
  {
    q: "What do I need to run it?",
    a: "Node and Postgres. The npm create headless-lms scaffolder can set up Postgres and MinIO for file storage with docker-compose, or point at ones you already run. Every adapter slot is optional, so you can start with nothing else configured.",
  },
  {
    q: "Do I have to use the admin and student apps?",
    a: "No. Both are built on the public SDK like any other frontend. Use them as they are, change them, or build your own against the same API.",
  },
  {
    q: "Can I swap the email or storage provider?",
    a: "Yes. Email, templates, storage and workflows are adapters behind ports in the core. Use a shipped adapter such as Resend, SES, MinIO, S3 or Hatchet, or implement the port yourself.",
  },
  {
    q: "How do AI agents connect?",
    a: "Through the MCP endpoint, authenticated with OAuth. Agents operate the LMS through the same domain layer as the SDK and the dashboards.",
  },
  {
    q: "How do I extend it?",
    a: "Drop a plugin folder into your installation and it's loaded at startup, or subscribe to the system's events with signed webhooks.",
  },
];

export function Faq() {
  return (
    <section className="container-page mt-28 md:mt-40">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <SectionLabel>Questions</SectionLabel>
          <h2 className="mt-5 text-[36px] leading-[1.02] font-semibold tracking-[-0.045em] text-foreground md:text-[48px]">
            Asked often.
          </h2>
          <p className="mt-4 max-w-[34ch] text-[15px] leading-relaxed text-muted-foreground">
            Something else?{" "}
            <a
              href={`${siteConfig.githubUrl}/issues`}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline decoration-line-strong underline-offset-4 hover:decoration-foreground"
            >
              Open an issue
            </a>{" "}
            on GitHub.
          </p>
        </div>
        <div className="border-t border-line">
          {faqs.map((f) => (
            <details key={f.q} className="group border-b border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[16.5px] font-medium tracking-[-0.01em] text-foreground [&::-webkit-details-marker]:hidden">
                {f.q}
                <Plus className="size-4 shrink-0 text-subtle transition-transform duration-200 group-open:rotate-45" />
              </summary>
              <p className="max-w-[62ch] pb-6 text-[15px] leading-relaxed text-pretty text-muted-foreground">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
