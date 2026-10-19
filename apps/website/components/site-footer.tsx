import Link from "next/link";
import { ThemeSwitch } from "fumadocs-ui/layouts/shared/slots/theme-switch";
import { Logo } from "@/components/logo";
import { siteConfig } from "@/lib/site";

const footerLinks = [
  {
    title: "Product",
    links: [
      { label: "Platform", href: "/#platform" },
      { label: "AI agents", href: "/#mcp" },
      { label: "Apps", href: "/#apps" },
      { label: "Open source", href: "/#open-source" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Getting started", href: "/docs" },
      { label: "Self-hosting", href: "/docs/self-hosting" },
      { label: "Architecture", href: "/docs/architecture" },
      { label: "API reference", href: "/docs/api" },
      { label: "Webhooks", href: "/docs/webhooks" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Changelog", href: "/changelog" },
      { label: "RSS", href: "/blog/rss.xml" },
      { label: "llms.txt", href: "/llms.txt" },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "GitHub", href: siteConfig.githubUrl },
      { label: "Contributing", href: `${siteConfig.githubUrl}/blob/main/CONTRIBUTING.md` },
      { label: "Issues", href: `${siteConfig.githubUrl}/issues` },
      { label: "MIT License", href: `${siteConfig.githubUrl}/blob/main/LICENSE` },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto">
      <div className="container-page pt-20 pb-10 md:pt-24">
        <div className="grid gap-12 lg:grid-cols-[1.5fr_repeat(4,1fr)] lg:gap-8">
          <div className="flex flex-col">
            <Link href="/" aria-label="Homepage" className="w-fit text-foreground">
              <Logo className="text-[19px]" markClassName="size-6" />
            </Link>
            <p className="mt-5 max-w-[290px] text-[14px] leading-relaxed text-muted-foreground">
              The open-source, API-first LMS. Courses, progress and entitlements as a typed
              TypeScript API.
            </p>
            {!siteConfig.forcedTheme && (
              <ThemeSwitch mode="light-dark-system" className="mt-8 w-fit lg:mt-auto" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4 lg:contents">
            {footerLinks.map((group) => (
              <div key={group.title}>
                <div className="text-[13px] font-medium text-foreground">{group.title}</div>
                <ul role="list" className="mt-4 space-y-2.5">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      {link.href.startsWith("http") ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[14px] text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-[14px] text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-16 flex flex-col gap-3 border-t border-line pt-6 text-[13px] text-subtle sm:flex-row sm:items-center sm:justify-between">
          <div>
            © {new Date().getFullYear()} {siteConfig.name} · {siteConfig.license}
          </div>
          <code className="font-mono text-[12px]">{siteConfig.installCommand}</code>
        </div>
      </div>
    </footer>
  );
}
