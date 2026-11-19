import { describe, it, expect } from 'vitest';
import { EmailRenderError, isEmailRenderError, Mailer, type MailerSources } from './mailer.js';
import type {
  EmailContent,
  EmailMessage,
  EmailTemplateId,
  TemplateContext,
  TemplateRenderer,
} from './ports.js';

function fakes() {
  const rendered: { id: EmailTemplateId; ctx: TemplateContext; payload: unknown }[] = [];
  const sent: EmailMessage[] = [];
  const templates: TemplateRenderer = {
    async render(id, ctx, payload): Promise<EmailContent> {
      rendered.push({ id, ctx, payload });
      return { subject: `subject:${id}`, html: `<p>${id}</p>`, text: `text:${id}` };
    },
  };
  const email = {
    async send(message: EmailMessage) {
      sent.push(message);
    },
  };
  return { rendered, sent, templates, email };
}

const BRANDING = { brandName: 'Acme LMS', baseUrl: 'http://localhost:8001' };

const CTX: TemplateContext = {
  ...BRANDING,
  organization: null,
  courseApp: null,
  communityApp: null,
  requestedApp: null,
  recipient: { email: 's@e.com', id: null, firstName: null, lastName: null },
};

const ACME = { id: 'org_acme', name: 'Acme', slug: 'acme', metadata: { customer: 'cus_7' } };
const LEARN = { id: 'app_learn', name: 'Acme Academy', slug: 'academy' };
const CLUB = { id: 'app_club', name: 'Acme Club', slug: 'club' };
const APPS = [
  { ...LEARN, domain: 'https://learn.acme.test', courses: true, community: false },
  { ...CLUB, domain: 'https://club.acme.test', courses: false, community: true },
];

function sources(apps = APPS) {
  const asked: string[] = [];
  const mailerSources: MailerSources = {
    organization: async (orgId) => {
      asked.push(orgId);
      return orgId === ACME.id ? { organization: ACME, apps } : null;
    },
    recipient: async (email) =>
      email === 'sarah@example.com'
        ? { id: 'usr_sarah', firstName: 'Sarah', lastName: 'Lee' }
        : null,
  };
  return { asked, mailerSources };
}

describe('Mailer', () => {
  it('renders the template and sends the result', async () => {
    const { rendered, sent, templates, email } = fakes();
    const mailer = new Mailer(templates, email, BRANDING);

    await mailer.send('s@e.com', 'magicLink', { url: 'http://x/y' });

    expect(rendered).toEqual([{ id: 'magicLink', ctx: CTX, payload: { url: 'http://x/y' } }]);
    expect(sent).toEqual([
      {
        to: 's@e.com',
        subject: 'subject:magicLink',
        text: 'text:magicLink',
        html: '<p>magicLink</p>',
      },
    ]);
  });

  it('names a template that failed to render, and sends nothing', async () => {
    const { sent, email } = fakes();
    const templates: TemplateRenderer = {
      async render() {
        throw new Error('digest.posts is not an array');
      },
    };
    const mailer = new Mailer(templates, email, BRANDING);

    const failure = await mailer
      .send('s@e.com', 'magicLink', { url: 'http://x/y' })
      .catch((e) => e);

    expect(failure).toBeInstanceOf(EmailRenderError);
    expect(isEmailRenderError(failure)).toBe(true);
    expect((failure as Error).message).toBe(
      'email template magicLink failed to render: digest.posts is not an array',
    );
    expect(sent).toEqual([]);
  });

  it('gives a template the organization, its apps and the recipient when the send names one', async () => {
    const { rendered, templates, email } = fakes();
    const { asked, mailerSources } = sources();
    const mailer = new Mailer(templates, email, BRANDING, mailerSources);

    await mailer.send('sarah@example.com', 'courseCompleted', { courseTitle: 'Spanish' }, ACME.id);
    await mailer.send('s@e.com', 'magicLink', { url: 'http://x/y' });

    expect(asked).toEqual([ACME.id]);
    expect(rendered[0]?.ctx).toEqual({
      ...BRANDING,
      organization: ACME,
      courseApp: { ...LEARN, domain: 'https://learn.acme.test' },
      communityApp: { ...CLUB, domain: 'https://club.acme.test' },
      requestedApp: null,
      recipient: {
        email: 'sarah@example.com',
        id: 'usr_sarah',
        firstName: 'Sarah',
        lastName: 'Lee',
      },
    });
    expect(rendered[1]?.ctx).toEqual(CTX);
  });

  it('gives a template the app the email was requested on', async () => {
    const { rendered, templates, email } = fakes();
    const mailer = new Mailer(templates, email, BRANDING, sources().mailerSources);

    await mailer.send('s@e.com', 'magicLink', { url: 'http://x/y' }, ACME.id, CLUB.id);
    await mailer.send('s@e.com', 'magicLink', { url: 'http://x/y' }, ACME.id, 'app_gone');

    expect(rendered[0]?.ctx.requestedApp).toEqual({ ...CLUB, domain: 'https://club.acme.test' });
    expect(rendered[1]?.ctx.requestedApp).toBeNull();
  });

  it('gives one app as both when it serves courses and the community, and none when there is none', async () => {
    const { rendered, templates, email } = fakes();
    const both = { ...LEARN, domain: 'https://acme.platform.test', courses: true, community: true };
    await new Mailer(templates, email, BRANDING, sources([both]).mailerSources).send(
      's@e.com',
      'courseCompleted',
      { courseTitle: 'Spanish' },
      ACME.id,
    );
    await new Mailer(templates, email, BRANDING, sources([APPS[0]!]).mailerSources).send(
      's@e.com',
      'courseCompleted',
      { courseTitle: 'Spanish' },
      ACME.id,
    );

    const app = { ...LEARN, domain: 'https://acme.platform.test' };
    expect(rendered[0]?.ctx).toMatchObject({ courseApp: app, communityApp: app });
    expect(rendered[1]?.ctx.communityApp).toBeNull();
  });

  it('gives a template no organization when the organization is gone', async () => {
    const { rendered, templates, email } = fakes();
    const mailer = new Mailer(templates, email, BRANDING, sources().mailerSources);

    await mailer.send('s@e.com', 'courseCompleted', { courseTitle: 'Spanish' }, 'org_gone');

    expect(rendered[0]?.ctx).toEqual(CTX);
  });
});
