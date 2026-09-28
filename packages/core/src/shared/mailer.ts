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

/** Resolves the recipient/content details a template needs when the
 *  triggering event carries only row ids. Wired by the app layer. */
export interface MailerLookups {
  orgUserEmail(orgId: string, orgUserId: string): Promise<string | null>;
  contentInfo(
    orgId: string,
    contentId: string,
  ): Promise<{ id: string; title: string; type: ContentType } | null>;
}

export class Mailer {
  constructor(
    private readonly templates: TemplateRenderer,
    private readonly email: EmailSender,
    private readonly ctx: TemplateContext,
  ) {}

  async send<K extends EmailTemplateId>(
    to: string,
    id: K,
    params: EmailTemplateParams[K],
    ctx?: Partial<TemplateContext>,
  ): Promise<void> {
    const content = await this.templates.render(id, { ...this.ctx, ...ctx }, params);
    await this.email.send({ to, subject: content.subject, text: content.text, html: content.html });
  }
}
