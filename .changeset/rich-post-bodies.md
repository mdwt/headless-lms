---
"@headless-lms/core": minor
"@headless-lms/server": minor
"@headless-lms/sdk": minor
"@headless-lms/adapter-defaults": minor
"create-headless-lms": minor
---

Rich post bodies: the server reads a post's body through a `BodyParser` port, which returns its plain text, its mentions and the files it shows. The default `PlainBodyParser` (`@headless-lms/adapter-defaults/body`) reads the body as plain text; the container takes another through `adapters.bodyParser`. Notification and email excerpts use the parsed text.

A body can show any file its author uploaded: a member upload takes any content type, and its kind (image, video, audio or document) follows the type. `PostView.assets` describes each file the body shows (its URL, kind, filename and size), and `GET /api/member/posts/:postId/assets/:assetId` (`getPostAsset`) serves it to whoever can read the post; a file a browser cannot show inline downloads under its filename. A body holds at most 20 files. A post no longer needs a topic in a space that defines topics. A refused upload names the size limit.

Breaking: `ServerConfig` requires `memberFileMaxBytes`, the largest member upload that is not an image (`MEMBER_FILE_MAX_BYTES` in the scaffolded config, 100 MB by default).
