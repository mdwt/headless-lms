import type { EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { Layout, Paragraph, PREVIEW_CTX } from './layout.js';

type Params = EmailTemplateParams['courseCompleted'];

export const subject = (_ctx: TemplateContext, params: Params) => `You completed ${params.courseTitle} 🎉`;

export default function CourseCompleted({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading="Congratulations!">
      <Paragraph>You've completed {params.courseTitle}. Nice work.</Paragraph>
    </Layout>
  );
}

CourseCompleted.PreviewProps = { ctx: PREVIEW_CTX, params: { courseTitle: 'Fly Tying 101' } };
