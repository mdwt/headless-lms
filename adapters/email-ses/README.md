# @headless-lms/adapter-email-ses

AWS SES (SESv2) implementation of the `EmailSender` port from `@headless-lms/core/types`.

The adapter reads no environment itself — the installation's `config.ts` parses
env into a `SesEmailConfig` and injects the constructed adapter:

```ts
import { SesEmailAdapter } from "@headless-lms/adapter-email-ses";

const container = await createContainer(config, {
  adapters: { email: new SesEmailAdapter({ region, from }) },
});
```

Omit `accessKeyId`/`secretAccessKey` to use the default AWS credential chain
(IAM role, env vars, shared profile).

## Environment variables (reference installation)

| Variable                 | Required | Maps to                | Notes                                                       |
| ------------------------ | -------- | ---------------------- | ----------------------------------------------------------- |
| `SES_REGION`             | yes      | `region`               |                                                             |
| `EMAIL_FROM`             | yes      | `from`                 | e.g. `Acme LMS <noreply@acme.com>`, a verified SES identity.|
| `SES_ACCESS_KEY`         | no       | `accessKeyId`          | Omit for the default credential chain.                      |
| `SES_SECRET_KEY`         | no       | `secretAccessKey`      | Omit for the default credential chain.                      |
| `SES_CONFIGURATION_SET`  | no       | `configurationSetName` | SES configuration set to send through.                      |
