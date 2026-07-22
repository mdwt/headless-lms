import { Button, Text } from '@react-email/components';
import type { EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { Layout, PREVIEW_CTX } from './layout.js';

type Params = EmailTemplateParams['passwordReset'];

export const subject = (ctx: TemplateContext, _params: Params) => `Reset your ${ctx.brandName} password`;

export default function PasswordReset({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading="Reset your password">
      <Text>Click the button below to choose a new password. The link expires shortly.</Text>
      <Button href={params.resetUrl} style={{ backgroundColor: '#111', color: '#fff', padding: '10px 20px' }}>
        Reset password
      </Button>
      <Text>If you did not request a reset, your password is unchanged and you can ignore this email.</Text>
    </Layout>
  );
}

PasswordReset.PreviewProps = { ctx: PREVIEW_CTX, params: { resetUrl: 'http://localhost:8002/reset?token=demo' } };
