import Link from 'next/link'
import { Logo, GithubIcon } from '@/components/logo'
import { siteConfig } from '@/lib/site'

const footerLinks = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '/#features' },
      { label: 'Architecture', href: '/#architecture' },
      { label: 'Typed SDK', href: '/#sdk' },
      { label: 'MCP endpoint', href: '/#mcp' },
    ],
  },
  {
    title: 'Docs',
    links: [
      { label: 'Getting started', href: '/docs' },
      { label: 'Self-hosting', href: '/docs/self-hosting' },
      { label: 'Project structure', href: '/docs/project-structure' },
      { label: 'API reference', href: '/docs/api-reference' },
    ],
  },
  {
    title: 'Community',
    links: [
      { label: 'GitHub', href: siteConfig.githubUrl },
      { label: 'Contributing', href: `${siteConfig.githubUrl}/blob/main/CONTRIBUTING.md` },
      { label: 'MIT License', href: `${siteConfig.githubUrl}/blob/main/LICENSE` },
      { label: 'Issues', href: `${siteConfig.githubUrl}/issues` },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo className="size-6 text-primary" />
            <span className="text-base font-semibold">Headless LMS</span>
          </Link>
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            An open-source, API-first LMS platform for building learning systems in modern TypeScript.
          </p>
          <a
            href={siteConfig.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <GithubIcon className="size-4" />
            Star on GitHub
          </a>
        </div>

        {footerLinks.map((group) => (
          <div key={group.title}>
            <h3 className="mb-3 text-sm font-medium text-foreground">
              {group.title}
            </h3>
            <ul className="space-y-2.5">
              {group.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>MIT Licensed. Built with Fastify, Drizzle, and Zod.</p>
          <p className="font-mono">{siteConfig.installCommand}</p>
        </div>
      </div>
    </footer>
  )
}
