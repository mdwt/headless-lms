import type { EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { EmailButton, Layout, Paragraph, PREVIEW_CTX } from './layout.js';

type Params = EmailTemplateParams['memberInvite'];

export const subject = (ctx: TemplateContext, _params: Params) =>
  `You've been invited to join ${ctx.brandName}`;

export default function MemberInvite({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading={`Join ${ctx.brandName}`}>
      <Paragraph>
        {params.inviterName} invited you to join {ctx.brandName} as {params.role}.
      </Paragraph>
      <EmailButton href={params.inviteUrl}>Accept invitation</EmailButton>
      <Paragraph>If you weren't expecting this invitation, you can ignore this email.</Paragraph>
    </Layout>
  );
}

MemberInvite.PreviewProps = {
  ctx: PREVIEW_CTX,
  params: {
    inviteUrl: 'http://localhost:8001/invite?token=demo',
    inviterName: 'Ann',
    role: 'admin',
  },
};
