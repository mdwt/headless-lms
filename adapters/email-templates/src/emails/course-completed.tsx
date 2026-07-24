import type { EmailTemplatePayloads, TemplateContext } from '@headless-lms/types';
import { Layout, Paragraph, PREVIEW_CTX } from './layout.js';

type Payload = EmailTemplatePayloads['courseCompleted'];

export const subject = (_ctx: TemplateContext, { course }: Payload) => `You completed ${course.title} 🎉`;

export default function CourseCompleted({ ctx, payload }: { ctx: TemplateContext; payload: Payload }) {
  return (
    <Layout ctx={ctx} heading="Congratulations!">
      <Paragraph>You've completed {payload.course.title}. Nice work.</Paragraph>
    </Layout>
  );
}

CourseCompleted.PreviewProps = {
  ctx: PREVIEW_CTX,
  payload: {
    student: {
      id: 'stu1',
      orgId: 'org1',
      externalId: null,
      email: 'sam@example.com',
      firstName: 'Sam',
      lastName: 'Doe',
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    },
    course: { id: 'demo', type: 'course', title: 'Fly Tying 101' },
  },
};
