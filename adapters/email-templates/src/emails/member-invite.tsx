import { Button, Text } from '@react-email/components';
import type { EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { Layout, PREVIEW_CTX } from './layout.js';

type Params = EmailTemplateParams['memberInvite'];

export const subject = (ctx: TemplateContext, _params: Params) =>
  `You've been invited to join ${ctx.brandName}`;

export default function MemberInvite({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading={`Join ${ctx.brandName}`}>
      <Text>
        {params.inviterName} invited you to join {ctx.brandName} as {params.role}.
      </Text>
      <Button href={params.inviteUrl} style={{ backgroundColor: '#111', color: '#fff', padding: '10px 20px' }}>
        Accept invitation
      </Button>
      <Text>If you weren't expecting this invitation, you can ignore this email.</Text>
    </Layout>
  );
}

MemberInvite.PreviewProps = {
  ctx: PREVIEW_CTX,
  params: { inviteUrl: 'http://localhost:8001/accept-invitation/demo', inviterName: 'Ann', role: 'admin' },
};
