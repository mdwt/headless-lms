import type { ReactNode } from 'react'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { source } from '@/lib/source'
import { baseOptions } from '@/lib/layout.shared'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      {...baseOptions()}
      sidebar={{
        tabs: [
          { title: 'Docs', description: 'Guides and concepts', url: '/docs' },
          { title: 'API reference', description: 'Every endpoint, from the OpenAPI spec', url: '/docs/api' },
        ],
      }}
    >
      {children}
    </DocsLayout>
  )
}
