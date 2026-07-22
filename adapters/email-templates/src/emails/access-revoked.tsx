import type { EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { Layout, Paragraph, PREVIEW_CTX } from './layout.js';

type Params = EmailTemplateParams['accessRevoked'];

export const subject = (_ctx: TemplateContext, params: Params) => `Your access to ${params.contentTitle} has ended`;

export default function AccessRevoked({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading="Access ended">
      <Paragraph>
        Your access to {params.contentTitle} has ended. If you think this is a mistake, reply to this email.
      </Paragraph>
    </Layout>
  );
}

AccessRevoked.PreviewProps = { ctx: PREVIEW_CTX, params: { contentTitle: 'Fly Tying 101' } };
