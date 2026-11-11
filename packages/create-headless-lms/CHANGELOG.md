# create-headless-lms

## 0.3.2

### Patch Changes

- [#14](https://github.com/mdwt/headless-lms/pull/14) [`ce18ba3`](https://github.com/mdwt/headless-lms/commit/ce18ba386d73e06588253bc8e39c119898b403f2) Thanks [@mdwt](https://github.com/mdwt)! - Sign-in rate limits count each member separately behind a chain of proxies. The container config takes `trustedProxies` (the IPs or CIDR ranges of the proxies in front of the API) and `ipAddressHeaders` (the headers read for the client IP), and passes them to better-auth. A generated installation reads them from `AUTH_TRUSTED_PROXIES` and `AUTH_IP_ADDRESS_HEADERS`, comma-separated. Without them, every request that arrives with more than one address in `X-Forwarded-For` shares one rate limit.

- [#30](https://github.com/mdwt/headless-lms/pull/30) [`932f883`](https://github.com/mdwt/headless-lms/commit/932f883c8a287e349083d2849a5ccc20a007e141) Thanks [@mdwt](https://github.com/mdwt)! - A file link is signed when the read is made and expires `deliveryExpirySeconds` after, with no signing window. `ServerConfig.deliveryWindowSeconds` is `deliveryExpirySeconds` again, `AssetsServiceImpl` takes `downloadLinkExpirySeconds` instead of `linkWindowSeconds`, and `ObjectStorage.presignDownload` takes `expiresInSeconds` instead of `signedAt` and `expiresAt`.

## 0.3.1

### Patch Changes

- [#23](https://github.com/mdwt/headless-lms/pull/23) [`ca0f1da`](https://github.com/mdwt/headless-lms/commit/ca0f1da6ce3f92f2cfd0ec02d63df006f8dd0ac8) Thanks [@mdwt](https://github.com/mdwt)! - Files are served straight from storage. The read that returns a lesson, download, event, post, message, upload or library file now carries a signed storage link for each of its files, made after that read has checked access, instead of an API URL that redirected to one. A file costs no API request, and its link works from any host.

  Links are signed for a window: every read in the same window returns the same link, so browsers and caches keep the file, and the link expires at the end of the next window. `ServerConfig.deliveryExpirySeconds` is now `deliveryWindowSeconds` (`DELIVERY_URL_EXPIRY`, default six hours). Every signed file is served with `Cache-Control: public, max-age=31536000, immutable`.

  The redirect routes are gone: `getCourseThumbnail`, `getDownloadThumbnail`, `getCommunityThumbnail`, `getEventThumbnail`, `getSpaceImage`, `getActivityFile`, `getDownloadFile`, `getEventFile`, `getPostCover`, `getPostAsset`, `getMessageAttachment`, `getMemberUploadFile`, `getLibraryFile` and `downloadLibraryFile`. In core, `AssetFiles.signFile` is replaced by `fileLinks`, `FileUrls` builds public image URLs only and `createFileUrls` takes just the public URL builder, `AssetsServiceImpl` takes `linkWindowSeconds` instead of `downloadLinkExpirySeconds` and `fileUrls`, and the member report, post and chat services no longer have methods that sign a single file. A member of an unpublished community sees its images only with `communities:read`, as before.

  `ObjectStorage.presignDownload` takes `signedAt` and `expiresAt` instead of `expiresInSeconds`, and the S3 and MinIO adapters no longer take `downloadExpirySeconds`. The S3 adapter takes an optional `cloudFront` (`url`, `keyPairId`, `privateKey`) to sign links for a CloudFront distribution in front of the bucket; `publicBaseUrl` defaults to its url.

## 0.3.0

### Minor Changes

- [`b1e591a`](https://github.com/mdwt/headless-lms/commit/b1e591aec98dd633713f55ee99f424853ea3bd41) Thanks [@mdwt](https://github.com/mdwt)! - API keys work on every route under `/api`, not only `/mcp`, sent in the `x-api-key` header or as `Authorization: Bearer <key>`. A request that carries a key is judged on the key alone and never falls back to a session cookie. A key carries one of the organization's roles and holds that role's current permissions, limited to its creator's; it can expire after 1 to 365 days, and every new key starts with `hlms_`. `GET /api/access/api-keys/roles` lists the roles a person can put on a key, and a role can't be deleted while a key carries it.

  A platform key, set with `PLATFORM_KEY` and `PLATFORM_ACCOUNT_EMAIL`, creates organizations and their API keys through `POST /api/platform/organizations` and `POST /api/platform/organizations/:orgId/api-keys`. The organizations are owned by a platform account that can't sign in.

  Breaking changes:

  - `POST /api/access/api-keys` takes `role` and an optional `expiresInDays` instead of `scopes`. A key's response carries `role` and `expiresAt` instead of `scopes`. Keys created with scopes no longer verify.
  - `OrganizationService.resolveCaller` and `actorFor` take a `CallerLimit` (`{ scopes }` or `{ roleKey }`) instead of a scope list, and `AccessGrant` carries `limit` instead of `scopes`.
  - The `ApiKeys` port returns stored keys with `roleKey` and `expiresAt`, takes `{ name, roleKey, expiresInDays }` on create, and adds `countWithRole`. `OrgAdmin` adds `createOrganizationFor`, and the new `Accounts` port creates the platform account.

- [`5364095`](https://github.com/mdwt/headless-lms/commit/536409507d9d4956027c323fca8fdc5d60f19276) Thanks [@mdwt](https://github.com/mdwt)! - Live chat: every chat change is delivered to the members' open streams on every API instance. A new `PubSub` port carries chat changes between instances; the chat hub on each instance pushes the current state to the streams connected to it over server-sent events. `GET /api/member/communities/:communityId/chats/events` (`streamMemberChatEvents`) streams `ChatLiveEvent`s; access is checked when the stream opens. New reads: one chat (`getMemberChat`), the direct chat with a person (`getMemberDirectChat`) and the unread total (`getMemberChatUnread`); `sendChatTyping` tells the chat you are typing. `listMemberChats` takes `requests`, `ChatListItem` carries the participants' profiles, and a send takes a `clientId` that makes a repeat send return the stored message.

  Marking a chat read, changing a reaction and muting a chat now emit domain events (`discussion.chat.read`, `discussion.message.reactions.changed`, `discussion.chat.muted`) with no public form; a read mark only moves forward. `adapter-db` adds `messages.client_id` with its unique index (migration `0018`).

  Breaking: `ServerConfig` requires `pubsubDatabaseUrl`. The container takes `adapters.pubsub` (a `PubSub` or a factory given the logger) and exposes `container.pubsub` and `container.chatHub`; without one the stream answers 503. The entry point starts both after `listen` and before the outbox relay, as the scaffolded `main.ts` now does.

- [`96a06eb`](https://github.com/mdwt/headless-lms/commit/96a06eb1fd501da91f2324bedbb57ed3d3c4e866) Thanks [@mdwt](https://github.com/mdwt)! - Rich post bodies: the server reads a post's body through a `BodyParser` port, which returns its plain text, its mentions and the files it shows. The default `PlainBodyParser` (`@headless-lms/adapter-defaults/body`) reads the body as plain text; the container takes another through `adapters.bodyParser`. Notification and email excerpts use the parsed text.

  A body can show any file its author uploaded: a member upload takes any content type, and its kind (image, video, audio or document) follows the type. `PostView.assets` describes each file the body shows (its URL, kind, filename and size), and `GET /api/member/posts/:postId/assets/:assetId` (`getPostAsset`) serves it to whoever can read the post; a file a browser cannot show inline downloads under its filename. A body holds at most 20 files. A post no longer needs a topic in a space that defines topics. A refused upload names the size limit.

  Breaking: `ServerConfig` requires `memberFileMaxBytes`, the largest member upload that is not an image (`MEMBER_FILE_MAX_BYTES` in the scaffolded config, 100 MB by default).

### Patch Changes

- [`779799d`](https://github.com/mdwt/headless-lms/commit/779799d9c21d703707b26003377bf4aa2075f7ff) Thanks [@mdwt](https://github.com/mdwt)! - `closeOnSignals(app)` closes the server on SIGTERM or SIGINT so its close hooks run: open chat streams get `closed { reason: 'shutdown' }`, the outbox relay drains, the automation engine stops and PubSub unlistens. A second signal, or a close that takes longer than 10 s, exits at once. The API entry point and the project template call it after `listen`. Before this, nothing closed the server on a signal, and the Hatchet worker's own signal handler exited the process as soon as the worker stopped. `adapter-workflow-hatchet` now starts its worker with `handleKill: false` and logs `hatchet worker stopped`.

## 0.2.0

### Minor Changes

- [`f9faa8f`](https://github.com/mdwt/headless-lms/commit/f9faa8fb287da9c3c8d8f50194155430d63e8516) Thanks [@mdwt](https://github.com/mdwt)! - Notification subsystem: notification types and recipient rules in code, community and org notification categories, member settings per category, channel and space, push devices, follows and mutes as subscriptions, mentions, reaction and edit events, debounced chat notifications, community digests on their own schedule, and a filtered notification list with unread counts. Timed product work (scheduled posts, grant expiry, digests, the upload sweep) runs as jobs on a new `Scheduler` port.

  Breaking: nothing is seeded for a new org or community, and the seeded automations, the `notify` action and the automation `source` are gone; `GET`/`PUT /api/member/notification-preferences`, the post follow routes and the chat mute routes are removed in favour of notification settings and subscriptions; a `workflows` adapter must implement `Scheduler` beside `AutomationEngine`. The scaffolded `main.ts` starts the outbox relay and the engine after `listen`.

## 0.1.2

### Patch Changes

- Communities with spaces, posts, chats, moderation and member profiles; an MCP server with OAuth sign-in, connected apps and scoped API keys; access-checked proxy URLs for every file; per-person notification preferences; one API error envelope and request limits; security hardening across automations, auth and webhooks. Breaking: an organization no longer edits a person's name or email.

## 0.1.1

### Patch Changes

- [`f66e702`](https://github.com/mdwt/headless-lms/commit/f66e70258c748f01b966201a697707591dd06cef) Thanks [@mdwt](https://github.com/mdwt)! - Resolve @headless-lms/* dependency versions from the npm registry at scaffold time. The template hardcoded ^0.0.0, which was never published, so pnpm install failed in every scaffolded project (and migrate with it).

## 0.1.0

### Minor Changes

- 0f137b9: Initial public release
