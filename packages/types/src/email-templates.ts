// Email template catalog — every transactional email the system can send.
// The closed EmailTemplateId union is the guarantee that templates exist: a
// TemplateRenderer implementation must answer every member or fail typecheck.

/** Branding threaded into every template. */
export interface TemplateContext {
  /** Product or organization name shown in the email. */
  brandName: string;
  /** Origin links resolve against (e.g. the admin app URL). */
  baseUrl: string;
  logoUrl?: string;
}

/** A fully rendered email, ready for an EmailSender. */
export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

/** Template id → params. Adding an email = adding a row here. */
export interface EmailTemplateParams {
  magicLink: { url: string };
  studentInvite: { inviteUrl: string; studentName: string };
  memberInvite: { inviteUrl: string; inviterName: string; role: string };
  passwordReset: { resetUrl: string };
  emailVerification: { verifyUrl: string };
  accessGranted: { contentTitle: string; contentUrl: string };
  accessRevoked: { contentTitle: string };
  courseCompleted: { courseTitle: string };
}

export type EmailTemplateId = keyof EmailTemplateParams;

/** Resolves a template + data to rendered content. Deployment-swappable;
 *  default implementation: @headless-lms/adapter-email-templates. */
export interface TemplateRenderer {
  render<K extends EmailTemplateId>(
    id: K,
    ctx: TemplateContext,
    params: EmailTemplateParams[K],
  ): Promise<EmailContent>;
}
