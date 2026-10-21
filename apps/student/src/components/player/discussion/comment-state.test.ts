import { describe, it, expect } from "vitest";
import type { CommentView, CommentsConfig } from "@/lib/api/types";
import { groupComments, initialCommentsState, permissions, commentsReducer } from "./comment-state";

const author = {
  id: "orm_a",
  firstName: "Ana",
  lastName: "Diaz",
  image: null,
  role: "student" as const,
};
const instructor = {
  id: "orm_s",
  firstName: "Sarah",
  lastName: "Chen",
  image: null,
  role: "instructor" as const,
};

const ME = "orm_me";

function comment(over: Partial<CommentView> = {}): CommentView {
  return {
    id: "cmt_1",
    activityId: "act_1",
    postId: null,
    communityId: null,
    parentId: null,
    author,
    body: "hello",
    status: "published",
    removedBy: null,
    reactions: {},
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    ...over,
  };
}

/** Written by the reader the permission tests are asking about. */
function mine(over: Partial<CommentView> = {}): CommentView {
  return comment({ author: { ...author, id: ME }, ...over });
}

const open: CommentsConfig = {
  enabled: true,
  threaded: true,
  requireReview: false,
  reactions: true,
};

describe("groupComments", () => {
  it("nests replies under their root, one level deep", () => {
    const root = comment({ id: "r1" });
    const reply = comment({ id: "p1", parentId: "r1" });
    const nodes = groupComments([root, reply]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.comment.id).toBe("r1");
    expect(nodes[0]?.replies.map((r) => r.id)).toEqual(["p1"]);
  });

  it("keeps a removed root that still has a visible reply", () => {
    const root = comment({ id: "r1", status: "removed", body: null, removedBy: instructor });
    const reply = comment({ id: "p1", parentId: "r1" });
    expect(groupComments([root, reply])).toHaveLength(1);
  });

  it("drops a removed root with no visible replies", () => {
    const root = comment({ id: "r1", status: "removed", body: null, removedBy: instructor });
    expect(groupComments([root])).toHaveLength(0);
  });

  it("never renders a removed reply", () => {
    const root = comment({ id: "r1" });
    const reply = comment({ id: "p1", parentId: "r1", status: "removed", body: null });
    expect(groupComments([root, reply])[0]?.replies).toHaveLength(0);
  });

  it("drops a reply whose root is gone", () => {
    expect(groupComments([comment({ id: "p1", parentId: "missing" })])).toHaveLength(0);
  });
});

describe("permissions", () => {
  it("offers reply, react, edit and remove when comments are open", () => {
    const p = permissions(open, mine(), ME);
    expect(p).toMatchObject({
      canReply: true,
      canReact: true,
      canEdit: true,
      canRemove: true,
      canReport: false,
    });
  });

  it("offers report on someone else's comment, never on your own", () => {
    expect(permissions(open, comment(), ME).canReport).toBe(true);
    expect(permissions(open, mine(), ME).canReport).toBe(false);
  });

  it("closes every action when comments are off for the activity", () => {
    const off: CommentsConfig = { ...open, enabled: false };
    const p = permissions(off, comment(), ME);
    expect(p.canReport).toBe(false);
    expect(p.canReply).toBe(false);
    expect(p.canReact).toBe(false);
    expect(permissions(off, mine(), ME).canEdit).toBe(false);
  });

  it("lets an author still remove their own comment when comments are off", () => {
    const off: CommentsConfig = { ...open, enabled: false };
    expect(permissions(off, mine(), ME).canRemove).toBe(true);
  });

  it("refuses replies to a reply and to a pending comment", () => {
    expect(permissions(open, comment({ parentId: "r1" }), ME).canReply).toBe(false);
    expect(permissions(open, comment({ status: "pending" }), ME).canReply).toBe(false);
  });

  it("offers no reactions when the course disables them", () => {
    expect(permissions({ ...open, reactions: false }, comment(), ME).canReact).toBe(false);
  });
});

describe("commentsReducer", () => {
  it("marks comments off when they are disabled for this activity", () => {
    const next = commentsReducer(initialCommentsState, {
      kind: "loaded",
      view: { config: { ...open, enabled: false }, comments: [] },
    });
    expect(next.status).toBe("off");
  });

  it("appends an inserted comment and replaces it once the server answers", () => {
    const loaded = commentsReducer(initialCommentsState, {
      kind: "loaded",
      view: { config: open, comments: [] },
    });
    const optimistic = commentsReducer(loaded, {
      kind: "inserted",
      comment: mine({ id: "temp_1" }),
    });
    expect(optimistic.comments.map((c) => c.id)).toEqual(["temp_1"]);

    const confirmed = commentsReducer(optimistic, {
      kind: "replaced",
      id: "temp_1",
      comment: mine({ id: "cmt_9" }),
    });
    expect(confirmed.comments.map((c) => c.id)).toEqual(["cmt_9"]);
  });

  it("marks a removal locally rather than deleting the row", () => {
    const loaded = commentsReducer(initialCommentsState, {
      kind: "loaded",
      view: { config: open, comments: [mine({ id: "r1" })] },
    });
    const next = commentsReducer(loaded, { kind: "removed", id: "r1", by: author });
    expect(next.comments[0]?.status).toBe("removed");
    expect(next.comments[0]?.body).toBeNull();
    expect(next.comments[0]?.removedBy).toEqual(author);
  });

  it("takes the server's counts verbatim rather than computing them", () => {
    const loaded = commentsReducer(initialCommentsState, {
      kind: "loaded",
      view: { config: open, comments: [comment({ id: "r1" })] },
    });
    const on = commentsReducer(loaded, {
      kind: "reacted",
      id: "r1",
      reactions: { like: 4 },
      viewerReaction: "like",
    });
    expect(on.comments[0]?.reactions).toEqual({ like: 4 });
    expect(on.comments[0]?.viewerReaction).toBe("like");

    const off = commentsReducer(on, { kind: "reacted", id: "r1", reactions: { like: 3 } });
    expect(off.comments[0]?.reactions).toEqual({ like: 3 });
    expect(off.comments[0]?.viewerReaction).toBeUndefined();
  });

  it("leaves other comments untouched when one is reacted to", () => {
    const loaded = commentsReducer(initialCommentsState, {
      kind: "loaded",
      view: { config: open, comments: [comment({ id: "r1" }), comment({ id: "r2" })] },
    });
    const next = commentsReducer(loaded, {
      kind: "reacted",
      id: "r1",
      reactions: { like: 1 },
      viewerReaction: "like",
    });
    expect(next.comments[1]?.reactions).toEqual({});
    expect(next.comments[1]?.viewerReaction).toBeUndefined();
  });

  it("restores a snapshot on rollback", () => {
    const seeded = [comment({ id: "r1" })];
    const loaded = commentsReducer(initialCommentsState, {
      kind: "loaded",
      view: { config: open, comments: seeded },
    });
    const optimistic = commentsReducer(loaded, {
      kind: "inserted",
      comment: comment({ id: "temp_1" }),
    });
    const rolled = commentsReducer(optimistic, { kind: "restored", comments: seeded });
    expect(rolled.comments.map((c) => c.id)).toEqual(["r1"]);
  });

  it("records a failure without discarding what is already on screen", () => {
    const loaded = commentsReducer(initialCommentsState, {
      kind: "loaded",
      view: { config: open, comments: [comment({ id: "r1" })] },
    });
    const failed = commentsReducer(loaded, { kind: "failed", message: "offline" });
    expect(failed.error).toBe("offline");
    expect(failed.comments).toHaveLength(1);
    // A failed mutation on already-ready comments must not knock them back to
    // "error" — comments stay on screen, just with an error message set.
    expect(failed.status).toBe("ready");
  });

  it("moves to error status when the initial load itself fails", () => {
    const failed = commentsReducer(initialCommentsState, { kind: "failed", message: "offline" });
    expect(failed.status).toBe("error");
  });
});
