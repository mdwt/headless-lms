import type { EmailTemplatePayloads, TemplateContext } from '@headless-lms/types';
import { EmailButton, Layout, Paragraph, PREVIEW_CTX } from './layout.js';

type Payload = EmailTemplatePayloads['studentInvite'];

export const subject = (ctx: TemplateContext, _payload: Payload) => `You're invited to ${ctx.brandName}`;

export default function StudentInvite({ ctx, payload }: { ctx: TemplateContext; payload: Payload }) {
  return (
    <Layout ctx={ctx} heading="Welcome">
      <Paragraph>You've been invited to {ctx.brandName}. Create your account to get started.</Paragraph>
      <EmailButton href={payload.inviteUrl}>Create your account</EmailButton>
      <Paragraph>This invitation link is personal — please don't forward it.</Paragraph>
    </Layout>
  );
}

StudentInvite.PreviewProps = {
  ctx: PREVIEW_CTX,
  payload: {
    inviteUrl: 'http://localhost:8002/welcome?token=demo',
    invitation: {
      id: 'inv1',
      orgId: 'org1',
      email: 'sam@example.com',
      role: 'student',
      status: 'pending',
      invitedBy: 'user1',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
    },
  },
};
