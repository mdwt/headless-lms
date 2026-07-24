import type { EmailTemplatePayloads, TemplateContext } from '@headless-lms/types';
import { EmailButton, Layout, Paragraph, PREVIEW_CTX } from './layout.js';

type Payload = EmailTemplatePayloads['accessGranted'];

export const subject = (_ctx: TemplateContext, { entitlement }: Payload) =>
  `You now have access to ${entitlement.content.title}`;

export default function AccessGranted({ ctx, payload }: { ctx: TemplateContext; payload: Payload }) {
  const { content } = payload.entitlement;
  return (
    <Layout ctx={ctx} heading={`${content.title} is ready for you`}>
      <Paragraph>You've been granted access. Jump in whenever you're ready.</Paragraph>
      <EmailButton href={`${ctx.studentPortalUrl}/courses/${content.id}`}>Start learning</EmailButton>
    </Layout>
  );
}

AccessGranted.PreviewProps = {
  ctx: PREVIEW_CTX,
  payload: {
    entitlement: {
      id: 'ent1',
      studentId: 'stu1',
      firstName: 'Sam',
      lastName: 'Doe',
      studentEmail: 'sam@example.com',
      content: { id: 'demo', type: 'course', title: 'Fly Tying 101' },
      status: 'active',
      grantedAt: '2026-07-01T00:00:00.000Z',
      expiresAt: null,
      source: 'manual',
    },
  },
};
