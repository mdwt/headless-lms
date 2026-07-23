import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { changelog } from '@/lib/source'
import { getMDXComponents } from '@/components/mdx'

export const metadata: Metadata = {
  title: 'Changelog',
  description: 'New features, improvements, and fixes in Headless LMS.',
  alternates: {
    canonical: '/changelog',
  },
  openGraph: {
    title: 'Changelog | Headless LMS',
    description: 'New features, improvements, and fixes in Headless LMS.',
    url: '/changelog',
    type: 'website',
  },
}

const dateFormat = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

export default function ChangelogPage() {
  const entries = [...changelog.getPages()].sort(
    (a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime(),
  )

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Changelog</h1>
        <p className="mt-3 text-muted-foreground">
          New features, improvements, and fixes in Headless LMS.
        </p>

        <div className="mt-14 space-y-16">
          {entries.map((entry) => {
            const MDX = entry.data.body
            return (
              <article key={entry.url} id={entry.slugs[0]}>
                <time
                  dateTime={entry.data.date}
                  className="text-sm text-muted-foreground"
                >
                  {dateFormat.format(new Date(entry.data.date))}
                </time>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                  {entry.data.title}
                </h2>
                <div className="prose mt-6 min-w-0">
                  <MDX components={getMDXComponents()} />
                </div>
              </article>
            )
          })}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
