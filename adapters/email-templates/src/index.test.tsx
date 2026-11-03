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
  membershipEnded: { communities: [{ communityId: "cmy_1", communityTitle: "Founders" }] },
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
  postReacted: {
    postTitle: "Hello",
    reactorName: "Sam",
    reaction: "👍",
    postId: "pst_1",
    communityId: "cmy_1",
  },
  commentReacted: {
    postTitle: "Hello",
    excerpt: "Nice",
    reactorName: "Sam",
    reaction: "👍",
    commentId: "cmt_1",
    postId: "pst_1",
    communityId: "cmy_1",
  },
  mention: {
    authorName: "Sam",
    excerpt: "Thanks",
    communityId: "cmy_1",
    postTitle: "Hello",
    postId: "pst_1",
    commentId: null,
  },
  messageReacted: {
    excerpt: "Hello",
    reactorName: "Sam",
    reaction: "👍",
    chatId: "cht_1",
    communityId: "cmy_1",
  },
  courseActivityAdded: {
    courseTitle: "Fly Tying 101",
    moduleTitle: "Basics",
    activityTitle: "Choosing hooks",
    courseId: "crs_1",
    activityId: "act_1",
  },
  activityCommentCreated: {
    activityTitle: "Choosing hooks",
    courseTitle: "Fly Tying 101",
    commenterName: "Sam",
    excerpt: "Nice",
    courseId: "crs_1",
    activityId: "act_1",
    commentId: "cmt_1",
  },
  activityCommentRemoved: {
    activityTitle: "Choosing hooks",
    courseTitle: "Fly Tying 101",
    courseId: "crs_1",
    activityId: "act_1",
  },
  activityCommentReacted: {
    activityTitle: "Choosing hooks",
    courseTitle: "Fly Tying 101",
    excerpt: "Nice",
    reactorName: "Sam",
    reaction: "👍",
    courseId: "crs_1",
    activityId: "act_1",
    commentId: "cmt_1",
  },
  activityCommentFlagged: {
    activityTitle: "Choosing hooks",
    courseTitle: "Fly Tying 101",
    excerpt: "Hello",
    reason: "Spam",
    courseId: "crs_1",
    activityId: "act_1",
  },
  activityMention: {
    authorName: "Sam",
    excerpt: "Thanks",
    activityTitle: "Choosing hooks",
    courseTitle: "Fly Tying 101",
    courseId: "crs_1",
    activityId: "act_1",
  },
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

  it("writes an ending-soon date as a calendar day", async () => {
    const content = await renderer.render(
      "membershipEndingSoon",
      CTX,
      SAMPLE_PARAMS.membershipEndingSoon,
    );
    expect(content.text).toContain("October 28, 2026");
    expect(content.text).not.toContain("2026-10-28T00:00:00.000Z");
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

  it("names every community a membership ended in, and links one to its page", async () => {
    const one = await renderer.render("membershipEnded", CTX, SAMPLE_PARAMS.membershipEnded);
    expect(one.subject).toBe("Founders has ended");
    expect(one.html).toContain("http://localhost:8002/communities/cmy_1");
    const two = await renderer.render("membershipEnded", CTX, {
      communities: [
        { communityId: "cmy_1", communityTitle: "Founders" },
        { communityId: "cmy_2", communityTitle: "Makers" },
      ],
    });
    expect(two.subject).toBe("Founders, Makers has ended");
    expect(two.html).toContain('href="http://localhost:8002/communities"');
  });

  it("links a mention in a chat to the chat, and one in a comment to the comment", async () => {
    const inChat = await renderer.render("mention", CTX, {
      authorName: "Sam",
      excerpt: "Hi",
      communityId: "cmy_1",
      chatTitle: "Group chat",
      chatId: "cht_1",
    });
    expect(inChat.subject).toBe("Sam mentioned you in Group chat");
    expect(inChat.html).toContain("http://localhost:8002/communities/cmy_1/chats/cht_1");
    const inComment = await renderer.render("mention", CTX, {
      authorName: "Sam",
      excerpt: "Hi",
      communityId: "cmy_1",
      postTitle: "Hello",
      postId: "pst_1",
      commentId: "cmt_1",
    });
    expect(inComment.html).toContain("http://localhost:8002/communities/cmy_1/posts/pst_1#cmt_1");
  });

  it("links a course activity email to the activity in its course", async () => {
    const content = await renderer.render(
      "courseActivityAdded",
      CTX,
      SAMPLE_PARAMS.courseActivityAdded,
    );
    expect(content.html).toContain("http://localhost:8002/courses/crs_1#act_1");
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
