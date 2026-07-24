import { describe, it, expect } from 'vitest';
import type { EmailTemplateId, EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { ReactEmailTemplateRenderer } from './index.js';

const CTX: TemplateContext = {
  brandName: 'Acme LMS',
  baseUrl: 'http://localhost:8001',
  studentPortalUrl: 'http://localhost:8002',
};

const SAMPLE_PARAMS: { [K in EmailTemplateId]: EmailTemplateParams[K] } = {
  magicLink: { url: 'http://localhost:8001/magic?token=t' },
  studentInvite: { inviteUrl: 'http://localhost:8002/welcome?token=t', studentName: 'Sam' },
  memberInvite: {
    inviteUrl: 'http://localhost:8001/invite?token=t',
    inviterName: 'Ann',
    role: 'admin',
  },
  passwordReset: { resetUrl: 'http://localhost:8002/reset?token=t' },
  emailVerification: { verifyUrl: 'http://localhost:8002/verify?token=t' },
  accessGranted: { contentTitle: 'Fly Tying 101', contentId: 'c1' },
  accessRevoked: { contentTitle: 'Fly Tying 101' },
  courseCompleted: { courseTitle: 'Fly Tying 101' },
};

const ALL_IDS = Object.keys(SAMPLE_PARAMS) as EmailTemplateId[];

describe('ReactEmailTemplateRenderer', () => {
  const renderer = new ReactEmailTemplateRenderer();

  it.each(ALL_IDS)('renders %s with subject, html and text', async (id) => {
    const content = await renderer.render(id, CTX, SAMPLE_PARAMS[id]);
    expect(content.subject.length).toBeGreaterThan(0);
    expect(content.html).toContain('<');
    expect(content.text.length).toBeGreaterThan(0);
  });

  it('interpolates the params into html and text', async () => {
    const content = await renderer.render('studentInvite', CTX, SAMPLE_PARAMS.studentInvite);
    expect(content.html).toContain('http://localhost:8002/welcome?token=t');
    expect(content.text).toContain('http://localhost:8002/welcome?token=t');
  });

  it('brands every email with the context brand name', async () => {
    const content = await renderer.render('magicLink', CTX, SAMPLE_PARAMS.magicLink);
    expect(content.html).toContain('Acme LMS');
  });

  it('escapes html in user-supplied params data', async () => {
    const content = await renderer.render('accessGranted', CTX, {
      contentTitle: '<script>alert(1)</script>',
      contentId: 'c1',
    });
    expect(content.html).not.toContain('<script>');
  });
});
