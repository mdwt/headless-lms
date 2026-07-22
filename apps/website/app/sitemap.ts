import type { MetadataRoute } from 'next'
import { blog, source } from '@/lib/source'
import { absoluteUrl } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const docs = source.getPages().map((page) => ({
    url: absoluteUrl(page.url),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  const posts = blog.getPages().map((post) => ({
    url: absoluteUrl(post.url),
    lastModified: new Date(post.data.date),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  return [
    {
      url: absoluteUrl('/'),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: absoluteUrl('/blog'),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...docs,
    ...posts,
  ]
}
