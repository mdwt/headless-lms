# @headless-lms/utils

Runtime helpers for integration packages. Adapts zod schemas to the
`@headless-lms/types` integration contract:

- `zodConfig(schema)` — derives `configSchema()` + `validateConfig()`
- `zodSecrets(schema)` — derives `secretsSchema()`
- `zodAction({ id, description, input, output, run })` — builds an `Action`
  whose `invoke` parses input before calling `run`

`zod` is a peer dependency; types are kept in `@headless-lms/types` so this
package holds only code that must exist at runtime.
