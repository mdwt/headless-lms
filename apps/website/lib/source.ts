import { docs, blog as blogCollection, changelog as changelogCollection } from 'collections/server'
import { loader } from 'fumadocs-core/source'
import { toFumadocsSource } from 'fumadocs-mdx/runtime/server'

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
})

export const blog = loader({
  baseUrl: '/blog',
  source: toFumadocsSource(blogCollection, []),
})

export const changelog = loader({
  baseUrl: '/changelog',
  source: toFumadocsSource(changelogCollection, []),
})
