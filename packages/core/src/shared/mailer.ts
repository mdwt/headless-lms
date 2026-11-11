// Composes a TemplateRenderer with an EmailSender: callers name a template,
// the mailer resolves content and hands it to the transport.
import type {
  EmailSender,
  EmailTemplateId,
  EmailTemplateParams,
  TemplateContext,
  TemplateRenderer,
} from './ports.js';
import type { ContentType } from '../types/schemas/content.js';
import type { Hosts } from '../types/schemas/organizations.js';

/** Resolves the recipient/content details a template needs when the
 *  triggering event carries only row ids. Wired by the app layer. */
export interface MailerLookups {
  orgUserPerson(
    orgId: string,
    orgUserId: string,
  ): Promise<{ userId: string; email: string } | null>;
  contentInfo(
    orgId: string,
    contentId: string,
  ): Promise<{ id: string; title: string; type: ContentType } | null>;
}

export class EmailRejectedError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'EmailRejectedError';
  }
}

export function isEmailRejected(err: unknown): err is EmailRejectedError {
  return err instanceof Error && err.name === 'EmailRejectedError';
}

export class EmailRenderError extends Error {
  constructor(
    readonly template: string,
    cause: unknown,
  ) {
    super(
      `email template ${template} failed to render: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = 'EmailRenderError';
  }
}

export function isEmailRenderError(err: unknown): err is EmailRenderError {
  return err instanceof Error && err.name === 'EmailRenderError';
}

export class Mailer {
  constructor(
    private readonly templates: TemplateRenderer,
    private readonly email: EmailSender,
    private readonly ctx: Omit<TemplateContext, 'hosts'>,
    private readonly hostsOf?: (orgId: string) => Promise<Hosts>,
  ) {}

  async send<K extends EmailTemplateId>(
    to: string,
    id: K,
    params: EmailTemplateParams[K],
    orgId?: string,
  ): Promise<void> {
    const hosts = orgId && this.hostsOf ? await this.hostsOf(orgId) : null;
    let content: Awaited<ReturnType<TemplateRenderer['render']>>;
    try {
      content = await this.templates.render(id, { ...this.ctx, hosts }, params);
    } catch (err) {
      throw new EmailRenderError(id, err);
    }
    await this.email.send({ to, subject: content.subject, text: content.text, html: content.html });
  }
}
