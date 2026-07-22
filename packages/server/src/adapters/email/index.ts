// Default when no EmailSender is injected — fails loudly on use.
import type { EmailSender, EmailMessage, Logger } from '../../core/shared/ports.js';
import { noopLogger } from '../../core/shared/logger.js';

export class EmailAdapter implements EmailSender {
  constructor(private readonly logger: Logger = noopLogger) {}

  async send(_message: EmailMessage): Promise<void> {
    this.logger.error('email send failed: no transport configured');
    throw new Error('not implemented');
  }
}
