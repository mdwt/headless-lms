// Default when no EmailSender is injected — fails loudly on use.
import type { EmailSender, EmailMessage, EmailTemplateId, Logger, TemplateRenderer } from '../../core/shared/ports.js';
import { noopLogger } from '../../core/shared/logger.js';

export class EmailAdapter implements EmailSender {
  constructor(private readonly logger: Logger = noopLogger) {}

  async send(_message: EmailMessage): Promise<void> {
    this.logger.error('email send failed: no transport configured');
    throw new Error('not implemented');
  }
}

export class StubTemplateRenderer implements TemplateRenderer {
  constructor(private readonly logger: Logger = noopLogger) {}

  async render(id: EmailTemplateId): Promise<never> {
    this.logger.error('template render failed: no renderer configured', { id });
    throw new Error('no template renderer configured');
  }
}
