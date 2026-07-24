import type { EmailTemplatePayloads, TemplateContext } from '@headless-lms/types';
import { EmailButton, Layout, Paragraph, PREVIEW_CTX } from './layout.js';

type Payload = EmailTemplatePayloads['magicLink'];

export const subject = (ctx: TemplateContext, _payload: Payload) => `Sign in to ${ctx.brandName}`;

export default function MagicLink({ ctx, payload }: { ctx: TemplateContext; payload: Payload }) {
  return (
    <Layout ctx={ctx} heading="Sign in">
      <Paragraph>Click the button below to sign in. This link is valid once and expires shortly.</Paragraph>
      <EmailButton href={payload.url}>Sign in to {ctx.brandName}</EmailButton>
      <Paragraph>If you did not request this, you can ignore this email.</Paragraph>
    </Layout>
  );
}

MagicLink.PreviewProps = { ctx: PREVIEW_CTX, payload: { url: 'http://localhost:8002/magic?token=demo' } };
