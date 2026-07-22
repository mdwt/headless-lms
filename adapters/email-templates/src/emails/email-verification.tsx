import { Button, Text } from '@react-email/components';
import type { EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { Layout, PREVIEW_CTX } from './layout.js';

type Params = EmailTemplateParams['emailVerification'];

export const subject = (ctx: TemplateContext, _params: Params) => `Verify your email for ${ctx.brandName}`;

export default function EmailVerification({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading="Verify your email">
      <Text>Confirm this is your email address to finish setting up your account.</Text>
      <Button href={params.verifyUrl} style={{ backgroundColor: '#111', color: '#fff', padding: '10px 20px' }}>
        Verify email
      </Button>
    </Layout>
  );
}

EmailVerification.PreviewProps = { ctx: PREVIEW_CTX, params: { verifyUrl: 'http://localhost:8002/verify?token=demo' } };
