export const siteConfig = {
  name: 'Headless LMS',
  tagline: 'The API-first platform for building learning systems.',
  description:
    'An open-source, API-first headless LMS built in modern TypeScript with Fastify, Drizzle, and Zod. Composable adapters, org-scoped multi-tenancy, a typed SDK, and an MCP endpoint.',
  url: 'https://headless-lms.dev',
  githubUrl: 'https://github.com/mdwt/headless-lms',
  installCommand: 'npm create headless-lms',
  twitterHandle: '@meiringdw',
}

export const primaryNav = [
  { title: 'Docs', href: '/docs' },
  { title: 'Blog', href: '/blog' },
  { title: 'Changelog', href: '/changelog' },
]

export function absoluteUrl(path: string) {
  return `${siteConfig.url}${path}`
}
