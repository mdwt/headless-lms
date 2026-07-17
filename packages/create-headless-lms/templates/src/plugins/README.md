# plugins/

One folder per integration; the **directory name is the integration id**. Each
folder's `index.ts` default-exports an object satisfying the `Integration`
contract from `@headless-lms/types`. Loaded once at startup — a malformed
plugin fails the boot, not a request.

Two ways to add one:

1. **Published integration** — install it and re-export:
   `pnpm add @headless-lms/plugin-slack`, then `plugins/slack/index.ts`:
   `export { default } from "@headless-lms/plugin-slack";`
2. **Custom integration** — write the folder directly, depending only on
   `@headless-lms/types` (+ `@headless-lms/utils` for the zod helpers).
