import type { EmailTemplateParams, TemplateContext } from "@headless-lms/core/types";
import { EmailButton, Layout, Paragraph, PREVIEW_CTX } from "./layout.js";

type Params = EmailTemplateParams["accessGranted"];

export const subject = (_ctx: TemplateContext, params: Params) =>
  `You now have access to ${params.contentTitle}`;

const PORTAL_PATH: Record<Params["contentType"], string> = {
  course: "courses",
  download: "downloads",
};

export default function AccessGranted({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  const href = `${ctx.studentPortalUrl}/${PORTAL_PATH[params.contentType]}/${params.contentId}`;
  return (
    <Layout ctx={ctx} heading={`${params.contentTitle} is ready for you`}>
      <Paragraph>You've been granted access. Jump in whenever you're ready.</Paragraph>
      <EmailButton href={href}>
        {params.contentType === "download" ? "View download" : "Start learning"}
      </EmailButton>
    </Layout>
  );
}

AccessGranted.PreviewProps = {
  ctx: PREVIEW_CTX,
  params: {
    contentTitle: "Fly Tying 101",
    contentId: "demo",
    contentType: "course",
  },
};
