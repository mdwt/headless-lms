// Email adapter — implements the EmailSender port. Stub transport.
import type { EmailSender, EmailMessage } from "../../core/shared/ports.js";

export class EmailAdapter implements EmailSender {
  async send(_message: EmailMessage): Promise<void> {
    // TODO: wire a real transport (Resend/SES/Postmark).
    throw new Error("not implemented");
  }
}
