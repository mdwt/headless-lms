import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Hero } from "@/components/landing/hero";
import { Strip } from "@/components/landing/strip";
import { Platform } from "@/components/landing/platform";
import { Agents } from "@/components/landing/agents";
import { Apps } from "@/components/landing/apps";
import { OpenSource } from "@/components/landing/open-source";
import { Faq, faqs } from "@/components/landing/faq";
import { Cta } from "@/components/landing/cta";
import { absoluteUrl, siteConfig } from "@/lib/site";
import { jsonLdProps } from "@/lib/structured-data";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": absoluteUrl("/#software"),
      name: siteConfig.name,
      applicationCategory: "DeveloperApplication",
      applicationSubCategory: "Learning Management System",
      operatingSystem: "Any",
      url: siteConfig.url,
      description: siteConfig.description,
      license: "https://opensource.org/licenses/MIT",
      softwareHelp: absoluteUrl("/docs"),
      author: { "@id": absoluteUrl("/#organization") },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
    {
      "@type": "SoftwareSourceCode",
      "@id": `${siteConfig.githubUrl}#source`,
      name: siteConfig.name,
      description: siteConfig.description,
      codeRepository: siteConfig.githubUrl,
      programmingLanguage: "TypeScript",
      runtimePlatform: "Node.js",
      license: "https://opensource.org/licenses/MIT",
    },
    {
      "@type": "FAQPage",
      "@id": absoluteUrl("/#faq"),
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

export default function HomePage() {
  return (
    <div className="isolate flex min-h-dvh flex-col">
      <script {...jsonLdProps(jsonLd)} />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-md focus:border focus:border-border focus:bg-background focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <Hero />
        <Strip />
        <Platform />
        <Agents />
        <Apps />
        <OpenSource />
        <Faq />
        <Cta />
      </main>
      <SiteFooter />
    </div>
  );
}
