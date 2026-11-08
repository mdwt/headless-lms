import type { JSX } from "react";
import type { EmailTemplateParams, TemplateContext } from "@headless-lms/core/types";
import { Link, Section, Text } from "@react-email/components";
import { EmailButton, Layout, Paragraph, PREVIEW_CTX } from "./layout.js";

export function portal(ctx: TemplateContext, path: string): string {
  return `${ctx.studentPortalUrl}${path}`;
}

export function defineEmail<K extends keyof EmailTemplateParams>(opts: {
  subject: (ctx: TemplateContext, params: EmailTemplateParams[K]) => string;
  heading: (params: EmailTemplateParams[K]) => string;
  lines: (params: EmailTemplateParams[K]) => string[];
  button?: (
    ctx: TemplateContext,
    params: EmailTemplateParams[K],
  ) => { href: string; label: string };
  preview: EmailTemplateParams[K];
}): {
  subject: (ctx: TemplateContext, params: EmailTemplateParams[K]) => string;
  Component: (props: { ctx: TemplateContext; params: EmailTemplateParams[K] }) => JSX.Element;
} {
  function Component({ ctx, params }: { ctx: TemplateContext; params: EmailTemplateParams[K] }) {
    const button = opts.button?.(ctx, params);
    return (
      <Layout ctx={ctx} heading={opts.heading(params)}>
        {opts.lines(params).map((line, index) => (
          <Paragraph key={index}>{line}</Paragraph>
        ))}
        {button ? <EmailButton href={button.href}>{button.label}</EmailButton> : null}
      </Layout>
    );
  }
  Component.PreviewProps = { ctx: PREVIEW_CTX, params: opts.preview };
  return { subject: opts.subject, Component };
}

const community = (ctx: TemplateContext, id: string) => portal(ctx, `/communities/${id}`);
const space = (ctx: TemplateContext, communityId: string, spaceId: string) =>
  portal(ctx, `/communities/${communityId}/spaces/${spaceId}`);
const post = (ctx: TemplateContext, communityId: string, postId: string) =>
  portal(ctx, `/communities/${communityId}/posts/${postId}`);
const comment = (ctx: TemplateContext, communityId: string, postId: string, commentId: string) =>
  `${post(ctx, communityId, postId)}#${commentId}`;
const chat = (ctx: TemplateContext, communityId: string, chatId: string) =>
  portal(ctx, `/communities/${communityId}/chats/${chatId}`);

function accessEnds(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export const welcomeToCommunity = defineEmail<"welcomeToCommunity">({
  subject: (_ctx, params) => `Welcome to ${params.communityTitle}`,
  heading: (params) => params.communityTitle,
  lines: (params) => [
    params.spaceNames.length > 0
      ? `You can open ${params.spaceNames.join(", ")}.`
      : "You're a member.",
  ],
  button: (ctx, params) => ({ href: community(ctx, params.communityId), label: "Open community" }),
  preview: { communityTitle: "Founders", communityId: "cmy_1", spaceNames: ["Announcements"] },
});

export const membershipEndingSoon = defineEmail<"membershipEndingSoon">({
  subject: (_ctx, params) => `${params.communityTitle} ends soon`,
  heading: (params) => `${params.communityTitle} ends soon`,
  lines: (params) => [`Your access ends ${accessEnds(params.expiresAt)}.`],
  button: (ctx, params) => ({ href: community(ctx, params.communityId), label: "Renew" }),
  preview: {
    communityTitle: "Founders",
    communityId: "cmy_1",
    expiresAt: "2026-10-28T00:00:00.000Z",
  },
});

function communityTitles(params: EmailTemplateParams["membershipEnded"]): string {
  return params.communities.map((item) => item.communityTitle).join(", ");
}

export const membershipEnded = defineEmail<"membershipEnded">({
  subject: (_ctx, params) => `${communityTitles(params)} has ended`,
  heading: (params) => `${communityTitles(params)} has ended`,
  lines: (params) => [
    params.communities.length === 1
      ? "Your access to this community has ended."
      : "Your access to these communities has ended.",
  ],
  button: (ctx, params) => {
    const [only] = params.communities;
    return params.communities.length === 1 && only
      ? { href: community(ctx, only.communityId), label: "Renew" }
      : { href: portal(ctx, "/communities"), label: "Open communities" };
  },
  preview: { communities: [{ communityId: "cmy_1", communityTitle: "Founders" }] },
});

export const newPostInSpace = defineEmail<"newPostInSpace">({
  subject: (_ctx, params) => `${params.authorName} posted in ${params.spaceName}`,
  heading: (params) => params.postTitle,
  lines: (params) => [`${params.authorName} in ${params.spaceName}`, params.excerpt],
  button: (ctx, params) => ({
    href: post(ctx, params.communityId, params.postId),
    label: "Read post",
  }),
  preview: {
    spaceName: "Announcements",
    postTitle: "Hello",
    authorName: "Ann",
    excerpt: "A short note",
    postId: "pst_1",
    communityId: "cmy_1",
  },
});

export const yourPostWasPublished = defineEmail<"yourPostWasPublished">({
  subject: (_ctx, params) => `Your post was published in ${params.spaceName}`,
  heading: (params) => params.postTitle,
  lines: (params) => [`It's live in ${params.spaceName}.`],
  button: (ctx, params) => ({
    href: post(ctx, params.communityId, params.postId),
    label: "View post",
  }),
  preview: {
    postTitle: "Hello",
    spaceName: "Announcements",
    postId: "pst_1",
    communityId: "cmy_1",
  },
});

export const yourPostWasRemoved = defineEmail<"yourPostWasRemoved">({
  subject: (_ctx, params) => `Your post was removed from ${params.spaceName}`,
  heading: (params) => params.postTitle,
  lines: (params) => [`It was removed from ${params.spaceName}.`],
  button: (ctx, params) => ({
    href: space(ctx, params.communityId, params.spaceId),
    label: "Open space",
  }),
  preview: {
    postTitle: "Hello",
    spaceName: "Announcements",
    spaceId: "spc_1",
    communityId: "cmy_1",
  },
});

export const newCommentOnPost = defineEmail<"newCommentOnPost">({
  subject: (_ctx, params) => `${params.commenterName} commented on ${params.postTitle}`,
  heading: (params) => params.postTitle,
  lines: (params) => [params.commenterName, params.excerpt],
  button: (ctx, params) => ({
    href: comment(ctx, params.communityId, params.postId, params.commentId),
    label: "View comment",
  }),
  preview: {
    postTitle: "Hello",
    commenterName: "Sam",
    excerpt: "Nice",
    commentId: "cmt_1",
    postId: "pst_1",
    communityId: "cmy_1",
  },
});

export const replyToYourComment = defineEmail<"replyToYourComment">({
  subject: (_ctx, params) => `${params.commenterName} replied on ${params.postTitle}`,
  heading: (params) => params.postTitle,
  lines: (params) => [params.commenterName, params.excerpt],
  button: (ctx, params) => ({
    href: comment(ctx, params.communityId, params.postId, params.commentId),
    label: "View reply",
  }),
  preview: {
    postTitle: "Hello",
    commenterName: "Sam",
    excerpt: "Thanks",
    commentId: "cmt_2",
    postId: "pst_1",
    communityId: "cmy_1",
  },
});

export const yourCommentWasRemoved = defineEmail<"yourCommentWasRemoved">({
  subject: (_ctx, params) => `Your comment was removed from ${params.postTitle}`,
  heading: (params) => params.postTitle,
  lines: () => ["Your comment was removed."],
  button: (ctx, params) => ({
    href: post(ctx, params.communityId, params.postId),
    label: "View post",
  }),
  preview: { postTitle: "Hello", postId: "pst_1", communityId: "cmy_1" },
});

export const requestApproved = defineEmail<"requestApproved">({
  subject: (_ctx, params) => `You're in ${params.spaceName}`,
  heading: (params) => params.spaceName,
  lines: (params) => [`Your request to join ${params.spaceName} was approved.`],
  button: (ctx, params) => ({
    href: space(ctx, params.communityId, params.spaceId),
    label: "Open space",
  }),
  preview: { spaceName: "SaaS", spaceId: "spc_1", communityId: "cmy_1" },
});

export const requestDeclined = defineEmail<"requestDeclined">({
  subject: (_ctx, params) => `Request declined for ${params.spaceName}`,
  heading: (params) => params.spaceName,
  lines: (params) => [`Your request to join ${params.spaceName} was declined.`],
  button: (ctx, params) => ({ href: community(ctx, params.communityId), label: "Open community" }),
  preview: { spaceName: "SaaS", communityId: "cmy_1" },
});

export const invitedToSpace = defineEmail<"invitedToSpace">({
  subject: (_ctx, params) => `${params.inviterName} invited you to ${params.spaceName}`,
  heading: (params) => params.spaceName,
  lines: (params) => [`${params.inviterName} invited you.`],
  button: (ctx, params) => ({
    href: space(ctx, params.communityId, params.spaceId),
    label: "Accept",
  }),
  preview: {
    spaceName: "SaaS",
    inviterName: "Ann",
    spaceId: "spc_1",
    communityId: "cmy_1",
  },
});

export const messageRequest = defineEmail<"messageRequest">({
  subject: (_ctx, params) => `${params.senderName} sent a message request`,
  heading: (params) => params.senderName,
  lines: (params) => [params.excerpt],
  button: (ctx, params) => ({
    href: chat(ctx, params.communityId, params.chatId),
    label: "View request",
  }),
  preview: { senderName: "Ann", excerpt: "Hello", chatId: "cht_1", communityId: "cmy_1" },
});

export const newMessage = defineEmail<"newMessage">({
  subject: (_ctx, params) => `${params.senderName} in ${params.chatTitle}`,
  heading: (params) => params.chatTitle,
  lines: (params) => [`${params.senderName}: ${params.excerpt}`],
  button: (ctx, params) => ({
    href: chat(ctx, params.communityId, params.chatId),
    label: "Open chat",
  }),
  preview: {
    senderName: "Ann",
    chatTitle: "Group chat",
    excerpt: "Hello",
    chatId: "cht_1",
    communityId: "cmy_1",
  },
});

export const addedToGroupChat = defineEmail<"addedToGroupChat">({
  subject: (_ctx, params) => `${params.adderName} added you to a chat`,
  heading: () => "You were added to a chat",
  lines: (params) => [`${params.adderName} added you.`, params.participantNames.join(", ")],
  button: (ctx, params) => ({
    href: chat(ctx, params.communityId, params.chatId),
    label: "Open chat",
  }),
  preview: {
    adderName: "Ann",
    participantNames: ["Ann", "Sam"],
    chatId: "cht_1",
    communityId: "cmy_1",
  },
});

const ROLE_PATH: Record<string, string> = {
  course: "courses",
  download: "downloads",
  community: "communities",
  event: "events",
};

export const roleAssigned = defineEmail<"roleAssigned">({
  subject: (_ctx, params) => `You are now ${params.roleName} ${params.place}`,
  heading: (params) => `You are now ${params.roleName}`,
  lines: (params) => [`You are now ${params.roleName} ${params.place}.`],
  button: (ctx, params) =>
    params.contentId !== null && params.contentType !== null
      ? {
          href: `${ctx.baseUrl}/${ROLE_PATH[params.contentType] ?? ""}/${params.contentId}`,
          label: "Open",
        }
      : { href: ctx.baseUrl, label: "Open" },
  preview: {
    roleName: "Moderator",
    place: "of Founders",
    contentId: "cmy_1",
    contentType: "community",
  },
});

type DigestParams = EmailTemplateParams["digest"];

function commentsLabel(count: number): string {
  return count === 1 ? "1 comment" : `${count} comments`;
}

function Digest({ ctx, params }: { ctx: TemplateContext; params: DigestParams }) {
  return (
    <Layout ctx={ctx} heading={`${params.communityTitle} digest`}>
      <Paragraph>{"Here's what you haven't seen."}</Paragraph>
      {params.posts.map((item) => (
        <Section key={item.postId} className="my-[12px]">
          <Link
            href={post(ctx, params.communityId, item.postId)}
            className="text-[16px] font-semibold text-[#18181b]"
          >
            {item.title}
          </Link>
          <Text className="my-[2px] text-[14px] leading-[1.4] text-[#6b7280]">
            {`${item.authorName} in ${item.spaceName} · ${commentsLabel(item.commentCount)}`}
          </Text>
        </Section>
      ))}
      <EmailButton href={community(ctx, params.communityId)}>Open community</EmailButton>
    </Layout>
  );
}

Digest.PreviewProps = {
  ctx: PREVIEW_CTX,
  params: {
    communityTitle: "Founders",
    communityId: "cmy_1",
    from: "2026-10-29T07:00:00.000Z",
    to: "2026-11-05T07:00:00.000Z",
    posts: [
      {
        postId: "pst_1",
        title: "Welcome, everyone",
        authorName: "Sam",
        spaceName: "Announcements",
        commentCount: 4,
      },
    ],
  },
};

export const digest = {
  subject: (_ctx: TemplateContext, params: DigestParams) => `${params.communityTitle} digest`,
  Component: Digest,
};

export const postAwaitingReview = defineEmail<"postAwaitingReview">({
  subject: (_ctx, params) => `Post awaiting review in ${params.spaceName}`,
  heading: (params) => params.postTitle,
  lines: (params) => [`${params.authorName} submitted a post in ${params.spaceName}.`],
  button: (ctx, params) => ({
    href: space(ctx, params.communityId, params.spaceId),
    label: "Review",
  }),
  preview: {
    spaceName: "Announcements",
    postTitle: "Hello",
    authorName: "Sam",
    spaceId: "spc_1",
    communityId: "cmy_1",
  },
});

export const joinRequest = defineEmail<"joinRequest">({
  subject: (_ctx, params) => `${params.memberName} requested ${params.spaceName}`,
  heading: (params) => params.spaceName,
  lines: (params) => [`${params.memberName} asked to join. Seats left: ${params.seatsLeft}.`],
  button: (ctx, params) => ({
    href: space(ctx, params.communityId, params.spaceId),
    label: "Review request",
  }),
  preview: {
    spaceName: "SaaS",
    memberName: "Sam",
    seatsLeft: "3",
    spaceId: "spc_1",
    communityId: "cmy_1",
  },
});

export const somethingWasFlagged = defineEmail<"somethingWasFlagged">({
  subject: (_ctx, params) => `Something was flagged in ${params.spaceName}`,
  heading: (params) => params.spaceName,
  lines: (params) => [params.reason, params.excerpt],
  button: (ctx, params) => ({
    href: space(ctx, params.communityId, params.spaceId),
    label: "Review",
  }),
  preview: {
    spaceName: "Announcements",
    excerpt: "Hello",
    reason: "Spam",
    spaceId: "spc_1",
    communityId: "cmy_1",
  },
});

export const messageWasFlagged = defineEmail<"messageWasFlagged">({
  subject: () => "A message was flagged",
  heading: () => "A message was flagged",
  lines: (params) => [params.reason],
  button: (ctx, params) => ({ href: community(ctx, params.communityId), label: "Review" }),
  preview: { reason: "Spam", communityId: "cmy_1" },
});

export const postReacted = defineEmail<"postReacted">({
  subject: (_ctx, params) => `${params.reactorName} reacted to your post`,
  heading: (params) => params.postTitle,
  lines: (params) => [`${params.reactorName} reacted ${params.reaction} to your post.`],
  button: (ctx, params) => ({
    href: post(ctx, params.communityId, params.postId),
    label: "View post",
  }),
  preview: {
    postTitle: "Hello",
    reactorName: "Sam",
    reaction: "👍",
    postId: "pst_1",
    communityId: "cmy_1",
  },
});

export const commentReacted = defineEmail<"commentReacted">({
  subject: (_ctx, params) => `${params.reactorName} reacted to your comment`,
  heading: (params) => params.postTitle,
  lines: (params) => [`${params.reactorName} reacted ${params.reaction} to:`, params.excerpt],
  button: (ctx, params) => ({
    href: comment(ctx, params.communityId, params.postId, params.commentId),
    label: "View comment",
  }),
  preview: {
    postTitle: "Hello",
    excerpt: "Nice",
    reactorName: "Sam",
    reaction: "👍",
    commentId: "cmt_1",
    postId: "pst_1",
    communityId: "cmy_1",
  },
});

function mentionedIn(params: EmailTemplateParams["mention"]): string {
  return "postTitle" in params ? params.postTitle : params.chatTitle;
}

export const mention = defineEmail<"mention">({
  subject: (_ctx, params) => `${params.authorName} mentioned you in ${mentionedIn(params)}`,
  heading: (params) => mentionedIn(params),
  lines: (params) => [params.authorName, params.excerpt],
  button: (ctx, params) =>
    "postTitle" in params
      ? {
          href: params.commentId
            ? comment(ctx, params.communityId, params.postId, params.commentId)
            : post(ctx, params.communityId, params.postId),
          label: "View",
        }
      : { href: chat(ctx, params.communityId, params.chatId), label: "Open chat" },
  preview: {
    authorName: "Sam",
    excerpt: "Thanks @Ann",
    communityId: "cmy_1",
    postTitle: "Hello",
    postId: "pst_1",
    commentId: "cmt_1",
  },
});

export const messageReacted = defineEmail<"messageReacted">({
  subject: (_ctx, params) => `${params.reactorName} reacted to your message`,
  heading: () => "A reaction to your message",
  lines: (params) => [`${params.reactorName} reacted ${params.reaction} to:`, params.excerpt],
  button: (ctx, params) => ({
    href: chat(ctx, params.communityId, params.chatId),
    label: "Open chat",
  }),
  preview: {
    excerpt: "Hello",
    reactorName: "Sam",
    reaction: "👍",
    chatId: "cht_1",
    communityId: "cmy_1",
  },
});
