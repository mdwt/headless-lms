import { describe, it, expect } from 'vitest';
import { EmailRenderError, isEmailRenderError, Mailer } from './mailer.js';
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

const CTX: TemplateContext = {
  brandName: 'Acme LMS',
  baseUrl: 'http://localhost:8001',
  hosts: null,
};

describe('Mailer', () => {
  it('renders the template and sends the result', async () => {
    const { rendered, sent, templates, email } = fakes();
    const mailer = new Mailer(templates, email, CTX);

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
    const mailer = new Mailer(templates, email, CTX);

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

  it("renders with the organization's hosts when the send names one", async () => {
    const { rendered, templates, email } = fakes();
    const hosts = { courses: 'https://learn.acme.test', community: 'https://club.acme.test' };
    const asked: string[] = [];
    const mailer = new Mailer(templates, email, CTX, async (orgId) => {
      asked.push(orgId);
      return hosts;
    });

    await mailer.send('s@e.com', 'courseCompleted', { courseTitle: 'Spanish' }, 'org_acme');
    await mailer.send('s@e.com', 'magicLink', { url: 'http://x/y' });

    expect(asked).toEqual(['org_acme']);
    expect(rendered[0]?.ctx).toEqual({ ...CTX, hosts });
    expect(rendered[1]?.ctx).toEqual(CTX);
  });
});
