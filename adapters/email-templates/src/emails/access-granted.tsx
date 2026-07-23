import type { EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { EmailButton, Layout, Paragraph, PREVIEW_CTX } from './layout.js';

type Params = EmailTemplateParams['accessGranted'];

export const subject = (_ctx: TemplateContext, params: Params) => `You now have access to ${params.contentTitle}`;

export default function AccessGranted({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading={`${params.contentTitle} is ready for you`}>
      <Paragraph>You've been granted access. Jump in whenever you're ready.</Paragraph>
      <EmailButton href={`${ctx.studentPortalUrl}/courses/${params.contentId}`}>Start learning</EmailButton>
    </Layout>
  );
}

AccessGranted.PreviewProps = {
  ctx: PREVIEW_CTX,
  params: { contentTitle: 'Fly Tying 101', contentId: 'demo' },
};
