import { Button, Text } from '@react-email/components';
import type { EmailTemplateParams, TemplateContext } from '@headless-lms/types';
import { Layout, PREVIEW_CTX } from './layout.js';

type Params = EmailTemplateParams['accessGranted'];

export const subject = (_ctx: TemplateContext, params: Params) => `You now have access to ${params.contentTitle}`;

export default function AccessGranted({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading={`${params.contentTitle} is ready for you`}>
      <Text>You've been granted access. Jump in whenever you're ready.</Text>
      <Button href={params.contentUrl} style={{ backgroundColor: '#111', color: '#fff', padding: '10px 20px' }}>
        Start learning
      </Button>
    </Layout>
  );
}

AccessGranted.PreviewProps = {
  ctx: PREVIEW_CTX,
  params: { contentTitle: 'Fly Tying 101', contentUrl: 'http://localhost:8002/courses/demo' },
};
