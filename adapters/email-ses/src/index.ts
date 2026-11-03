// AWS SES implementation of the EmailSender port.
import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import type { EmailSender, EmailMessage, Logger } from "@headless-lms/core/types";
import { EmailRejectedError } from "@headless-lms/core/shared/mailer";

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

const THROTTLED = new Set([
  "TooManyRequestsException",
  "LimitExceededException",
  "ThrottlingException",
]);

interface SesFailure {
  name?: string;
  message?: string;
  $fault?: "client" | "server";
  $retryable?: unknown;
  $metadata?: { httpStatusCode?: number };
}

function rejected(err: unknown): EmailRejectedError | null {
  const failure = (err ?? {}) as SesFailure;
  const status = failure.$metadata?.httpStatusCode;
  if (
    failure.$fault !== "client" ||
    failure.$retryable ||
    status === 429 ||
    THROTTLED.has(failure.name ?? "")
  ) {
    return null;
  }
  return new EmailRejectedError(
    `ses ${failure.name ?? "error"}${status ? ` ${status}` : ""}: ${failure.message ?? ""}`,
    status,
  );
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
      this.logger?.error("email send failed", { err });
      throw rejected(err) ?? err;
    }
  }
}
