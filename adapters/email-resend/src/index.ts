// Resend implementation of the EmailSender port.
import type { EmailSender, EmailMessage, Logger } from "@headless-lms/types";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface ResendEmailConfig {
  apiKey: string;
  /** Sender, e.g. "Acme LMS <noreply@acme.com>". Must be on a verified Resend domain. */
  from: string;
}

export class ResendEmailAdapter implements EmailSender {
  constructor(
    private readonly config: ResendEmailConfig,
    private readonly logger?: Logger,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await this.fetchFn(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: this.config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!response.ok) {
      const detail = await response
        .json()
        .then((body: unknown) =>
          body && typeof body === "object" && "message" in body ? String(body.message) : "",
        )
        .catch(() => "");
      this.logger?.error("email send failed", { to: message.to, status: response.status, detail });
      throw new Error(`resend responded ${response.status}${detail ? `: ${detail}` : ""}`);
    }
  }
}
