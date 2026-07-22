import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { blog } from '@/lib/source'

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Writing on building Headless LMS — system design, domain-driven design, and the engineering behind an API-first learning platform.',
  alternates: {
    canonical: '/blog',
    types: {
      'application/rss+xml': '/blog/rss.xml',
    },
  },
  openGraph: {
    title: 'Blog | Headless LMS',
    description:
      'Writing on building Headless LMS — system design, domain-driven design, and the engineering behind an API-first learning platform.',
    url: '/blog',
    type: 'website',
  },
}

const dateFormat = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

export default function BlogIndexPage() {
  const posts = [...blog.getPages()].sort(
    (a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime(),
  )

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Blog</h1>
        <p className="mt-3 text-muted-foreground">
          Writing on building Headless LMS — system design, architecture, and
          the decisions along the way.
        </p>

        <div className="mt-10 space-y-8">
          {posts.map((post) => (
            <article key={post.url}>
              <Link
                href={post.url}
                className="group block rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/40"
              >
                <time
                  dateTime={post.data.date}
                  className="text-xs text-muted-foreground"
                >
                  {dateFormat.format(new Date(post.data.date))}
                </time>
                <h2 className="mt-2 text-xl font-semibold tracking-tight group-hover:text-primary">
                  {post.data.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {post.data.description}
                </p>
                <span className="mt-4 inline-block text-sm text-primary">
                  Read post →
                </span>
              </Link>
            </article>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
