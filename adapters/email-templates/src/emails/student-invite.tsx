import { Button, Text } from '@react-email/components';
import type { EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { Layout, PREVIEW_CTX } from './layout.js';

type Params = EmailTemplateParams['studentInvite'];

export const subject = (ctx: TemplateContext, _params: Params) => `You're invited to ${ctx.brandName}`;

export default function StudentInvite({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading={`Welcome, ${params.studentName}`}>
      <Text>You've been invited to {ctx.brandName}. Create your account to get started.</Text>
      <Button href={params.inviteUrl} style={{ backgroundColor: '#111', color: '#fff', padding: '10px 20px' }}>
        Create your account
      </Button>
      <Text>This invitation link is personal — please don't forward it.</Text>
    </Layout>
  );
}

StudentInvite.PreviewProps = {
  ctx: PREVIEW_CTX,
  params: { inviteUrl: 'http://localhost:8002/signup?token=demo', studentName: 'Sam Doe' },
};
