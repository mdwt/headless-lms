import { createOpenAPI } from 'fumadocs-openapi/server'

// Server-side only. The spec is generated from the routes by `pnpm gen:sdk`.
export const openapi = createOpenAPI({
  input: ['../../packages/sdk/openapi.json'],
})
