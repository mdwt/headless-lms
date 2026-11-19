// Composes a TemplateRenderer with an EmailSender: callers name a template,
// the mailer resolves content and hands it to the transport.
import type {
  EmailBranding,
  EmailSender,
  EmailTemplateId,
  EmailTemplateParams,
  TemplateApp,
  TemplateContext,
  TemplateOrganization,
  TemplateRecipient,
  TemplateRenderer,
} from './ports.js';
import type { ContentType } from '../types/schemas/content.js';

export type MailerApp = TemplateApp & { courses: boolean; community: boolean };

/** What a template receives about an organization and a recipient. Wired by the app layer. */
export interface MailerSources {
  organization(
    orgId: string,
  ): Promise<{ organization: TemplateOrganization; apps: MailerApp[] } | null>;
  recipient(email: string): Promise<Omit<TemplateRecipient, 'email'> | null>;
}

function templateApp(app: MailerApp | undefined): TemplateApp | null {
  return app ? { id: app.id, name: app.name, slug: app.slug, domain: app.domain } : null;
}

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
    private readonly branding: EmailBranding,
    private readonly sources?: MailerSources,
  ) {}

  async send<K extends EmailTemplateId>(
    to: string,
    id: K,
    params: EmailTemplateParams[K],
    orgId?: string,
    appId?: string,
  ): Promise<void> {
    const ctx = await this.context(to, orgId, appId);
    let content: Awaited<ReturnType<TemplateRenderer['render']>>;
    try {
      content = await this.templates.render(id, ctx, params);
    } catch (err) {
      throw new EmailRenderError(id, err);
    }
    await this.email.send({ to, subject: content.subject, text: content.text, html: content.html });
  }

  private async context(to: string, orgId?: string, appId?: string): Promise<TemplateContext> {
    const [org, person] = await Promise.all([
      orgId && this.sources ? this.sources.organization(orgId) : null,
      this.sources ? this.sources.recipient(to) : null,
    ]);
    const apps = org?.apps ?? [];
    return {
      ...this.branding,
      organization: org?.organization ?? null,
      courseApp: templateApp(apps.find((app) => app.courses)),
      communityApp: templateApp(apps.find((app) => app.community)),
      requestedApp: templateApp(appId ? apps.find((app) => app.id === appId) : undefined),
      recipient: {
        email: to,
        id: person?.id ?? null,
        firstName: person?.firstName ?? null,
        lastName: person?.lastName ?? null,
      },
    };
  }
}
