import { describe, it, expect } from "vitest";
import type {
  EmailTemplateId,
  EmailTemplateParams,
  TemplateContext,
} from "@headless-lms/core/types";
import { ReactEmailTemplateRenderer } from "./index.js";

const CTX: TemplateContext = {
  brandName: "Acme LMS",
  baseUrl: "http://localhost:8001",
  studentPortalUrl: "http://localhost:8002",
};

const SAMPLE_PARAMS: { [K in EmailTemplateId]: EmailTemplateParams[K] } = {
  magicLink: { url: "http://localhost:8001/magic?token=t" },
  studentInvite: { inviteUrl: "http://localhost:8002/welcome?token=t", studentName: "Sam" },
  memberInvite: {
    inviteUrl: "http://localhost:8001/invite?token=t",
    inviterName: "Ann",
    role: "admin",
  },
  passwordReset: { resetUrl: "http://localhost:8002/reset?token=t" },
  passwordChanged: {},
  emailVerification: { verifyUrl: "http://localhost:8002/verify?token=t" },
  accessGranted: { contentTitle: "Fly Tying 101", contentId: "c1", contentType: "course" },
  accessRevoked: { contentTitle: "Fly Tying 101" },
  courseCompleted: { courseTitle: "Fly Tying 101" },
  welcomeToCommunity: {
    communityTitle: "Founders",
    communityId: "cmy_1",
    spaceNames: ["Announcements"],
  },
  membershipEndingSoon: {
    communityTitle: "Founders",
    communityId: "cmy_1",
    expiresAt: "2026-10-28T00:00:00.000Z",
  },
  membershipEnded: { communityTitle: "Founders", communityId: "cmy_1" },
  newPostInSpace: {
    spaceName: "Announcements",
    postTitle: "Hello",
    authorName: "Ann",
    excerpt: "A short note",
    postId: "pst_1",
    communityId: "cmy_1",
  },
  yourPostWasPublished: {
    postTitle: "Hello",
    spaceName: "Announcements",
    postId: "pst_1",
    communityId: "cmy_1",
  },
  yourPostWasRemoved: {
    postTitle: "Hello",
    spaceName: "Announcements",
    spaceId: "spc_1",
    communityId: "cmy_1",
  },
  newCommentOnPost: {
    postTitle: "Hello",
    commenterName: "Sam",
    excerpt: "Nice",
    commentId: "cmt_1",
    postId: "pst_1",
    communityId: "cmy_1",
  },
  replyToYourComment: {
    postTitle: "Hello",
    commenterName: "Sam",
    excerpt: "Thanks",
    commentId: "cmt_2",
    postId: "pst_1",
    communityId: "cmy_1",
  },
  yourCommentWasRemoved: { postTitle: "Hello", postId: "pst_1", communityId: "cmy_1" },
  requestApproved: { spaceName: "SaaS", spaceId: "spc_1", communityId: "cmy_1" },
  requestDeclined: { spaceName: "SaaS", communityId: "cmy_1" },
  invitedToSpace: { spaceName: "SaaS", inviterName: "Ann", spaceId: "spc_1", communityId: "cmy_1" },
  messageRequest: { senderName: "Ann", excerpt: "Hello", chatId: "cht_1", communityId: "cmy_1" },
  newMessage: {
    senderName: "Ann",
    chatTitle: "Group chat",
    excerpt: "Hello",
    chatId: "cht_1",
    communityId: "cmy_1",
  },
  addedToGroupChat: {
    adderName: "Ann",
    participantNames: ["Ann", "Sam"],
    chatId: "cht_1",
    communityId: "cmy_1",
  },
  youAreNowAModerator: { communityTitles: ["Founders"] },
  digest: { communityTitle: "Founders", communityId: "cmy_1" },
  postAwaitingReview: {
    spaceName: "Announcements",
    postTitle: "Hello",
    authorName: "Sam",
    spaceId: "spc_1",
    communityId: "cmy_1",
  },
  joinRequest: {
    spaceName: "SaaS",
    memberName: "Sam",
    seatsLeft: "3",
    spaceId: "spc_1",
    communityId: "cmy_1",
  },
  somethingWasFlagged: {
    spaceName: "Announcements",
    excerpt: "Hello",
    reason: "Spam",
    spaceId: "spc_1",
    communityId: "cmy_1",
  },
  messageWasFlagged: { reason: "Spam", communityId: "cmy_1" },
};

const ALL_IDS = Object.keys(SAMPLE_PARAMS) as EmailTemplateId[];

describe("ReactEmailTemplateRenderer", () => {
  const renderer = new ReactEmailTemplateRenderer();

  it.each(ALL_IDS)("renders %s with subject, html and text", async (id) => {
    const content = await renderer.render(id, CTX, SAMPLE_PARAMS[id]);
    expect(content.subject.length).toBeGreaterThan(0);
    expect(content.html).toContain("<");
    expect(content.text.length).toBeGreaterThan(0);
  });

  it("interpolates the params into html and text", async () => {
    const content = await renderer.render("studentInvite", CTX, SAMPLE_PARAMS.studentInvite);
    expect(content.html).toContain("http://localhost:8002/welcome?token=t");
    expect(content.text).toContain("http://localhost:8002/welcome?token=t");
  });

  it("links passwordReset to the reset url", async () => {
    const resetUrl =
      "http://localhost:8000/api/auth/reset-password/t?callbackURL=http%3A%2F%2Flocalhost%3A8001%2Freset-password";
    const content = await renderer.render("passwordReset", CTX, { resetUrl });
    expect(content.html).toContain(`href="${resetUrl}"`);
    expect(content.text).toContain(resetUrl);
  });

  it.each([
    ["course", "http://localhost:8002/courses/c1"],
    ["download", "http://localhost:8002/downloads/c1"],
  ] as const)("links an accessGranted %s to its portal page", async (contentType, url) => {
    const content = await renderer.render("accessGranted", CTX, {
      contentTitle: "Fly Tying 101",
      contentId: "c1",
      contentType,
    });
    expect(content.html).toContain(url);
    expect(content.text).toContain(url);
  });

  it("brands every email with the context brand name", async () => {
    const content = await renderer.render("magicLink", CTX, SAMPLE_PARAMS.magicLink);
    expect(content.html).toContain("Acme LMS");
  });

  it("renders the Headless LMS logo and icon", async () => {
    const content = await renderer.render("magicLink", CTX, SAMPLE_PARAMS.magicLink);
    expect(content.html).toContain('src="https://headless-lms.dev/logo.png"');
    expect(content.html).toContain('src="https://headless-lms.dev/apple-icon"');
  });

  it("escapes html in user-supplied params data", async () => {
    const content = await renderer.render("accessGranted", CTX, {
      contentTitle: "<script>alert(1)</script>",
      contentId: "c1",
      contentType: "course",
    });
    expect(content.html).not.toContain("<script>");
  });
});
