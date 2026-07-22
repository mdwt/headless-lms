import type { EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { EmailButton, Layout, Paragraph, PREVIEW_CTX } from './layout.js';

type Params = EmailTemplateParams['magicLink'];

export const subject = (ctx: TemplateContext, _params: Params) => `Sign in to ${ctx.brandName}`;

export default function MagicLink({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading="Sign in">
      <Paragraph>Click the button below to sign in. This link is valid once and expires shortly.</Paragraph>
      <EmailButton href={params.url}>Sign in to {ctx.brandName}</EmailButton>
      <Paragraph>If you did not request this, you can ignore this email.</Paragraph>
    </Layout>
  );
}

MagicLink.PreviewProps = { ctx: PREVIEW_CTX, params: { url: 'http://localhost:8002/magic?token=demo' } };
