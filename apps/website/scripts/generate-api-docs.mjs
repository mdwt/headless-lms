// Regenerates content/docs/api from packages/sdk/openapi.json.
// Run after `pnpm gen:sdk`: pnpm --filter website gen:api-docs
import { generateFiles } from 'fumadocs-openapi'
import { createOpenAPI } from 'fumadocs-openapi/server'

const openapi = createOpenAPI({
  input: ['../../packages/sdk/openapi.json'],
})

await generateFiles({
  input: openapi,
  output: './content/docs/api',
  per: 'operation',
  groupBy: 'tag',
  includeDescription: true,
})
