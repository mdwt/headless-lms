---
"@headless-lms/core": minor
"@headless-lms/server": minor
"@headless-lms/sdk": minor
"@headless-lms/adapter-db": minor
"@headless-lms/adapter-auth": minor
"create-headless-lms": minor
---

Live chat: every chat change is delivered to the members' open streams on every API instance. A new `PubSub` port carries chat changes between instances; the chat hub on each instance pushes the current state to the streams connected to it over server-sent events. `GET /api/member/communities/:communityId/chats/events` (`streamMemberChatEvents`) streams `ChatLiveEvent`s, re-checking the session and community access every 30 s. New reads: one chat (`getMemberChat`), the direct chat with a person (`getMemberDirectChat`) and the unread total (`getMemberChatUnread`); `sendChatTyping` tells the chat you are typing. `listMemberChats` takes `requests`, `ChatListItem` carries the participants' profiles, and a send takes a `clientId` that makes a repeat send return the stored message.

Marking a chat read, changing a reaction and muting a chat now emit domain events (`discussion.chat.read`, `discussion.message.reactions.changed`, `discussion.chat.muted`) with no public form; a read mark only moves forward. `adapter-db` adds `messages.client_id` with its unique index (migration `0018`). `SessionVerifier.verify` takes `{ bypassCookieCache }`, implemented by `adapter-auth`.

Breaking: `ServerConfig` requires `pubsubDatabaseUrl`. The container takes `adapters.pubsub` (a `PubSub` or a factory given the logger) and exposes `container.pubsub` and `container.chatHub`; without one the stream answers 503. The entry point starts both after `listen` and before the outbox relay, as the scaffolded `main.ts` now does.
