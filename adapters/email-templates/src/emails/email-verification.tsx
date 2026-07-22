import type { EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { EmailButton, Layout, Paragraph, PREVIEW_CTX } from './layout.js';

type Params = EmailTemplateParams['emailVerification'];

export const subject = (ctx: TemplateContext, _params: Params) => `Verify your email for ${ctx.brandName}`;

export default function EmailVerification({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading="Verify your email">
      <Paragraph>Confirm this is your email address to finish setting up your account.</Paragraph>
      <EmailButton href={params.verifyUrl}>Verify email</EmailButton>
    </Layout>
  );
}

EmailVerification.PreviewProps = { ctx: PREVIEW_CTX, params: { verifyUrl: 'http://localhost:8002/verify?token=demo' } };
