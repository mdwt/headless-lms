import type { EmailTemplatePayloads, TemplateContext } from '@headless-lms/types';
import { EmailButton, Layout, Paragraph, PREVIEW_CTX } from './layout.js';

type Payload = EmailTemplatePayloads['passwordReset'];

export const subject = (ctx: TemplateContext, _payload: Payload) => `Reset your ${ctx.brandName} password`;

export default function PasswordReset({ ctx, payload }: { ctx: TemplateContext; payload: Payload }) {
  return (
    <Layout ctx={ctx} heading="Reset your password">
      <Paragraph>Click the button below to choose a new password. The link expires shortly.</Paragraph>
      <EmailButton href={payload.resetUrl}>Reset password</EmailButton>
      <Paragraph>If you did not request a reset, your password is unchanged and you can ignore this email.</Paragraph>
    </Layout>
  );
}

PasswordReset.PreviewProps = { ctx: PREVIEW_CTX, payload: { resetUrl: 'http://localhost:8002/reset?token=demo' } };
