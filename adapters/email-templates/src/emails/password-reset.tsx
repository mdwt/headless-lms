import type { EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { EmailButton, Layout, Paragraph, PREVIEW_CTX } from './layout.js';

type Params = EmailTemplateParams['passwordReset'];

export const subject = (ctx: TemplateContext, _params: Params) => `Reset your ${ctx.brandName} password`;

export default function PasswordReset({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading="Reset your password">
      <Paragraph>Click the button below to choose a new password. The link expires shortly.</Paragraph>
      <EmailButton href={params.resetUrl}>Reset password</EmailButton>
      <Paragraph>If you did not request a reset, your password is unchanged and you can ignore this email.</Paragraph>
    </Layout>
  );
}

PasswordReset.PreviewProps = { ctx: PREVIEW_CTX, params: { resetUrl: 'http://localhost:8002/reset?token=demo' } };
