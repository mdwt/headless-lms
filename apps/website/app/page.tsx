import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { Hero } from '@/components/landing/hero'
import { Features } from '@/components/landing/features'
import { Architecture } from '@/components/landing/architecture'
import { SdkShowcase } from '@/components/landing/sdk-showcase'
import { AppsMcp } from '@/components/landing/apps-mcp'
import { Cta } from '@/components/landing/cta'
import { siteConfig } from '@/lib/site'

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      name: siteConfig.name,
      url: siteConfig.url,
      description: siteConfig.description,
    },
    {
      '@type': 'SoftwareApplication',
      name: siteConfig.name,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Any',
      url: siteConfig.url,
      description: siteConfig.description,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    },
  ],
}

export default function HomePage() {
  return (
    <div className="isolate flex min-h-dvh flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Features />
        <AppsMcp />
        <Architecture />

        <SdkShowcase />

        <Cta />
      </main>
      <SiteFooter />
    </div>
  );
}
