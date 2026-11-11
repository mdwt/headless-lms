import type { EmailTemplateParams, TemplateContext } from "@headless-lms/core/types";
import { communityApp, courseApp } from "./community.js";
import { EmailButton, Layout, Paragraph, PREVIEW_CTX } from "./layout.js";

type Params = EmailTemplateParams["accessGranted"];

export const subject = (_ctx: TemplateContext, params: Params) =>
  `You now have access to ${params.contentTitle}`;

const PORTAL_PATH: Record<Exclude<Params["contentType"], "bundle">, string> = {
  course: "courses",
  download: "downloads",
  community: "communities",
  event: "events",
};

const BUTTON: Record<Params["contentType"], string> = {
  course: "Start learning",
  download: "View download",
  community: "Open community",
  event: "Open event",
  bundle: "Open your library",
};

function hrefOf(ctx: TemplateContext, params: Params): string {
  if (params.contentType === "bundle") {
    return courseApp(ctx, "");
  }
  const path = `/${PORTAL_PATH[params.contentType]}/${params.contentId}`;
  return params.contentType === "community" || params.contentType === "event"
    ? communityApp(ctx, path)
    : courseApp(ctx, path);
}

export default function AccessGranted({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading={`${params.contentTitle} is ready for you`}>
      <Paragraph>
        {params.contentType === "bundle"
          ? "You've been granted access to everything it includes. Jump in whenever you're ready."
          : "You've been granted access. Jump in whenever you're ready."}
      </Paragraph>
      <EmailButton href={hrefOf(ctx, params)}>{BUTTON[params.contentType]}</EmailButton>
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
