import { Button, Text } from '@react-email/components';
import type { EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { Layout, PREVIEW_CTX } from './layout.js';

type Params = EmailTemplateParams['magicLink'];

export const subject = (ctx: TemplateContext, _params: Params) => `Sign in to ${ctx.brandName}`;

export default function MagicLink({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading="Sign in">
      <Text>Click the button below to sign in. This link is valid once and expires shortly.</Text>
      <Button href={params.url} style={{ backgroundColor: '#111', color: '#fff', padding: '10px 20px' }}>
        Sign in to {ctx.brandName}
      </Button>
      <Text>If you did not request this, you can ignore this email.</Text>
    </Layout>
  );
}

MagicLink.PreviewProps = { ctx: PREVIEW_CTX, params: { url: 'http://localhost:8002/magic?token=demo' } };
