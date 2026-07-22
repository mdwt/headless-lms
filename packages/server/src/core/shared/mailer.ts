// Composes a TemplateRenderer with an EmailSender: callers name a template,
// the mailer resolves content and hands it to the transport.
import type {
  EmailSender,
  EmailTemplateId,
  EmailTemplateParams,
  TemplateContext,
  TemplateRenderer,
} from './ports.js';

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
