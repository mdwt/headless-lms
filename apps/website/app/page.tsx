import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { Hero } from '@/components/landing/hero'
import { Features } from '@/components/landing/features'
import { Architecture } from '@/components/landing/architecture'
import { SdkShowcase } from '@/components/landing/sdk-showcase'
import { AppsMcp } from '@/components/landing/apps-mcp'
import { Cta } from '@/components/landing/cta'

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Features />
        <Architecture />
        <SdkShowcase />
        <AppsMcp />
        <Cta />
      </main>
      <SiteFooter />
    </div>
  )
}
