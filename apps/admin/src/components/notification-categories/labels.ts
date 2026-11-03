const CATEGORY_LABELS: Record<string, string> = {
  about_you: "About you",
  review: "Review",
  mentions: "Mentions",
  comments_on_my_posts: "Comments on my posts",
  replies_to_my_comments: "Replies to my comments",
  followed_posts: "Followed posts",
  followed_threads: "Followed threads",
  messages: "Messages",
  likes_on_my_posts: "Likes on my posts",
  likes_on_my_comments: "Likes on my comments",
  new_posts: "New posts",
  digest: "Digest",
  access: "Access",
  course_content: "Course content",
};

const CHANNEL_LABELS: Record<string, string> = {
  inApp: "In-app",
  email: "Email",
  push: "Push",
};

function humanize(key: string): string {
  const words = key.replace(/_+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

export function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? humanize(key);
}

export function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? humanize(channel);
}

export function reasonLabel(reason: string): string {
  return reason.replace(/_/g, " ");
}
