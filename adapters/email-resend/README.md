# @headless-lms/adapter-email-resend

Resend implementation of the `EmailSender` port from `@headless-lms/types`.

The adapter reads no environment itself — the installation's `config.ts` parses
env into a `ResendEmailConfig` and injects the constructed adapter:

```ts
import { ResendEmailAdapter } from "@headless-lms/adapter-email-resend";

const container = await createContainer(config, {
  adapters: { email: new ResendEmailAdapter({ apiKey, from }) },
});
```

## Environment variables (reference installation)

| Variable         | Required | Maps to  | Notes                                                    |
| ---------------- | -------- | -------- | -------------------------------------------------------- |
| `RESEND_API_KEY` | yes      | `apiKey` | Unset → no adapter injected; email sends fail loudly.    |
| `EMAIL_FROM`     | no       | `from`   | e.g. `Acme LMS <noreply@acme.com>`, on a verified Resend domain. Defaults to `onboarding@resend.dev`. |
