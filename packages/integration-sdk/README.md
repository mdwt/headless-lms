# @headless-lms/integration-sdk

The contract an integration package implements to be loadable by the platform.

An integration default-exports an `Integration`: an `id`, JSON-Schema getters
for its connection config and secrets, a config validator, and a list of
`Action`s (typed input/output, invoked with the connection's revealed secrets
and config via `ActionContext`).

Author schemas with zod and adapt them with the helpers:

```ts
import { zodConfig, zodSecrets, zodAction, type Integration } from "@headless-lms/integration-sdk";

const example: Integration = {
  id: "example",
  ...zodConfig(ConfigSchema),
  ...zodSecrets(SecretsSchema),
  actions: [zodAction({ id, description, input, output, run })],
};
export default example;
```

The api's `core/integrations` context re-exports these types, so the platform
and integration packages share one definition. See `@headless-lms/plugin-slack`
for a complete implementation.
