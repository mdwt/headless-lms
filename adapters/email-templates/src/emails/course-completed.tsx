import { Text } from '@react-email/components';
import type { EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { Layout, PREVIEW_CTX } from './layout.js';

type Params = EmailTemplateParams['courseCompleted'];

export const subject = (_ctx: TemplateContext, params: Params) => `You completed ${params.courseTitle} 🎉`;

export default function CourseCompleted({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading="Congratulations!">
      <Text>You've completed {params.courseTitle}. Nice work.</Text>
    </Layout>
  );
}

CourseCompleted.PreviewProps = { ctx: PREVIEW_CTX, params: { courseTitle: 'Fly Tying 101' } };
