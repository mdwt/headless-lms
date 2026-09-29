// AWS SES implementation of the EmailSender port.
import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import type { EmailSender, EmailMessage, Logger } from "@headless-lms/core/types";

export interface SesEmailConfig {
  region: string;
  /** Sender, e.g. "Acme LMS <noreply@acme.com>". Must be a verified SES identity. */
  from: string;
  /** Omit both keys to use the default AWS credential chain (IAM role, env, profile). */
  accessKeyId?: string;
  secretAccessKey?: string;
  /** SES configuration set to send through. */
  configurationSetName?: string;
}

interface SesClient {
  send(command: SendEmailCommand): Promise<unknown>;
}

export class SesEmailAdapter implements EmailSender {
  private readonly client: SesClient;

  constructor(
    private readonly config: SesEmailConfig,
    private readonly logger?: Logger,
    client?: SesClient,
  ) {
    this.client =
      client ??
      new SESv2Client({
        region: config.region,
        ...(config.accessKeyId && config.secretAccessKey
          ? {
              credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
              },
            }
          : {}),
      });
  }

  async send(message: EmailMessage): Promise<void> {
    const command = new SendEmailCommand({
      FromEmailAddress: this.config.from,
      Destination: { ToAddresses: [message.to] },
      ...(this.config.configurationSetName
        ? { ConfigurationSetName: this.config.configurationSetName }
        : {}),
      Content: {
        Simple: {
          Subject: { Data: message.subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: message.text, Charset: "UTF-8" },
            ...(message.html !== undefined
              ? { Html: { Data: message.html, Charset: "UTF-8" } }
              : {}),
          },
        },
      },
    });
    try {
      await this.client.send(command);
    } catch (err) {
      const e = err as { name?: string; message?: string };
      this.logger?.error("email send failed", {
        to: message.to,
        name: e?.name ?? "",
        detail: e?.message ?? "",
      });
      throw err;
    }
  }
}
