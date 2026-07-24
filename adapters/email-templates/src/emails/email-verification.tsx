import type { EmailTemplatePayloads, TemplateContext } from '@headless-lms/types';
import { EmailButton, Layout, Paragraph, PREVIEW_CTX } from './layout.js';

type Payload = EmailTemplatePayloads['emailVerification'];

export const subject = (ctx: TemplateContext, _payload: Payload) => `Verify your email for ${ctx.brandName}`;

export default function EmailVerification({ ctx, payload }: { ctx: TemplateContext; payload: Payload }) {
  return (
    <Layout ctx={ctx} heading="Verify your email">
      <Paragraph>Confirm this is your email address to finish setting up your account.</Paragraph>
      <EmailButton href={payload.verifyUrl}>Verify email</EmailButton>
    </Layout>
  );
}

EmailVerification.PreviewProps = { ctx: PREVIEW_CTX, payload: { verifyUrl: 'http://localhost:8002/verify?token=demo' } };
