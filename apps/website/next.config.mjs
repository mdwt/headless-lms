import { createMDX } from 'fumadocs-mdx/next'

const withMDX = createMDX()

const canonicalHost = 'headless-lms.dev'
const redirectHosts = ['www.headless-lms.dev', 'headless-lms.com', 'www.headless-lms.com']

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return redirectHosts.map((host) => ({
      source: '/:path*',
      has: [{ type: 'host', value: host }],
      destination: `https://${canonicalHost}/:path*`,
      permanent: true,
    }))
  },
}

export default withMDX(nextConfig)
