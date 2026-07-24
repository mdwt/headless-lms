import type { EmailTemplatePayloads, TemplateContext } from '@headless-lms/types';
import { EmailButton, Layout, Paragraph, PREVIEW_CTX } from './layout.js';

type Payload = EmailTemplatePayloads['memberInvite'];

export const subject = (ctx: TemplateContext, _payload: Payload) =>
  `You've been invited to join ${ctx.brandName}`;

export default function MemberInvite({ ctx, payload }: { ctx: TemplateContext; payload: Payload }) {
  return (
    <Layout ctx={ctx} heading={`Join ${ctx.brandName}`}>
      <Paragraph>
        You've been invited to join {ctx.brandName} as {payload.invitation.role}.
      </Paragraph>
      <EmailButton href={payload.inviteUrl}>Accept invitation</EmailButton>
      <Paragraph>If you weren't expecting this invitation, you can ignore this email.</Paragraph>
    </Layout>
  );
}

MemberInvite.PreviewProps = {
  ctx: PREVIEW_CTX,
  payload: {
    inviteUrl: 'http://localhost:8001/invite?token=demo',
    invitation: {
      id: 'inv1',
      orgId: 'org1',
      email: 'ann@example.com',
      role: 'admin',
      status: 'pending',
      invitedBy: 'user1',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
    },
  },
};
