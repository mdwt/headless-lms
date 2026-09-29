import { z } from "zod";

export const webhookSchema = z.object({
  url: z
    .string()
    .trim()
    .pipe(z.url({ protocol: /^https?$/, error: "Enter a valid http:// or https:// URL" })),
  description: z.string().trim().max(200, "Keep it under 200 characters"),
  events: z.array(z.string()).min(1, "Choose at least one event"),
});

export type WebhookFormValues = z.infer<typeof webhookSchema>;
