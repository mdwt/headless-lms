import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'
import { Logo } from '@/components/logo'
import { siteConfig } from '@/lib/site'

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <Logo className="size-5 text-primary" />
          <span className="font-semibold">{siteConfig.name}</span>
        </>
      ),
      url: '/',
    },
    githubUrl: siteConfig.githubUrl,
    links: [
      { text: 'Docs', url: '/docs' },
      { text: 'API', url: '/docs/api' },
      { text: 'Blog', url: '/blog' },
    ],
    themeSwitch: { enabled: false },
  }
}
