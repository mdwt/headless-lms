import type { EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { EmailButton, Layout, Paragraph, PREVIEW_CTX } from './layout.js';

type Params = EmailTemplateParams['studentInvite'];

export const subject = (ctx: TemplateContext, _params: Params) => `You're invited to ${ctx.brandName}`;

export default function StudentInvite({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading={`Welcome, ${params.studentName}`}>
      <Paragraph>You've been invited to {ctx.brandName}. Create your account to get started.</Paragraph>
      <EmailButton href={params.inviteUrl}>Create your account</EmailButton>
      <Paragraph>This invitation link is personal — please don't forward it.</Paragraph>
    </Layout>
  );
}

StudentInvite.PreviewProps = {
  ctx: PREVIEW_CTX,
  params: { inviteUrl: 'http://localhost:8002/signup?token=demo', studentName: 'Sam Doe' },
};
