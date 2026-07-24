import { describe, it, expect } from 'vitest';
import type { EmailTemplateId, EmailTemplatePayloads, Entitlement, Invitation, TemplateContext } from '@headless-lms/types';
import { ReactEmailTemplateRenderer } from './index.js';

const CTX: TemplateContext = {
  brandName: 'Acme LMS',
  baseUrl: 'http://localhost:8001',
  studentPortalUrl: 'http://localhost:8002',
};

const ENTITLEMENT: Entitlement = {
  id: 'e1',
  studentId: 's1',
  firstName: 'Sam',
  lastName: 'Doe',
  studentEmail: 'sam@example.com',
  content: { id: 'c1', type: 'course', title: 'Fly Tying 101' },
  status: 'active',
  grantedAt: '2026-07-01T00:00:00.000Z',
  expiresAt: null,
  source: 'manual',
};

const INVITATION: Invitation = {
  id: 'inv1',
  orgId: 'org1',
  email: 'sam@example.com',
  role: 'student',
  status: 'pending',
  invitedBy: 'user1',
  expiresAt: null,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
};

const SAMPLE_PAYLOADS: { [K in EmailTemplateId]: EmailTemplatePayloads[K] } = {
  magicLink: { url: 'http://localhost:8001/magic?token=t' },
  studentInvite: { inviteUrl: 'http://localhost:8002/welcome?token=t', invitation: INVITATION },
  memberInvite: {
    inviteUrl: 'http://localhost:8001/invite?token=t',
    invitation: { ...INVITATION, email: 'ann@example.com', role: 'admin' },
  },
  passwordReset: { resetUrl: 'http://localhost:8002/reset?token=t' },
  emailVerification: { verifyUrl: 'http://localhost:8002/verify?token=t' },
  accessGranted: { entitlement: ENTITLEMENT },
  accessRevoked: { entitlement: ENTITLEMENT },
  courseCompleted: {
    student: {
      id: 's1',
      orgId: 'org1',
      externalId: null,
      email: 'sam@example.com',
      firstName: 'Sam',
      lastName: 'Doe',
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    },
    course: { id: 'c1', type: 'course', title: 'Fly Tying 101' },
  },
};

const ALL_IDS = Object.keys(SAMPLE_PAYLOADS) as EmailTemplateId[];

describe('ReactEmailTemplateRenderer', () => {
  const renderer = new ReactEmailTemplateRenderer();

  it.each(ALL_IDS)('renders %s with subject, html and text', async (id) => {
    const content = await renderer.render(id, CTX, SAMPLE_PAYLOADS[id]);
    expect(content.subject.length).toBeGreaterThan(0);
    expect(content.html).toContain('<');
    expect(content.text.length).toBeGreaterThan(0);
  });

  it('interpolates the payload into html and text', async () => {
    const content = await renderer.render('studentInvite', CTX, SAMPLE_PAYLOADS.studentInvite);
    expect(content.html).toContain('http://localhost:8002/welcome?token=t');
    expect(content.text).toContain('http://localhost:8002/welcome?token=t');
  });

  it('brands every email with the context brand name', async () => {
    const content = await renderer.render('magicLink', CTX, SAMPLE_PAYLOADS.magicLink);
    expect(content.html).toContain('Acme LMS');
  });

  it('escapes html in user-supplied payload data', async () => {
    const content = await renderer.render('accessGranted', CTX, {
      entitlement: {
        ...ENTITLEMENT,
        content: { ...ENTITLEMENT.content, title: '<script>alert(1)</script>' },
      },
    });
    expect(content.html).not.toContain('<script>');
  });
});
