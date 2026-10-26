# Assets review

Reviewed on 2026-10-22 on branch `feature/community-impl` at `4144428`, against `docs/domain/assets.md`, `docs/domain/content.md`, `docs/domain/reporting.md`, `docs/domain/identity.md`, `docs/community-spec.md` and `docs/community-exploration.md`.

The question under review: the assets context serves two different uses, product files that staff put in the library and files that members upload for their own profile, posts and messages. Both belong in one context. This document records where the model, the code and the docs did not say how one registry serves both, the decisions taken, and the state of each fix.

## The two uses

**Library files.** Staff upload a course video, an inline image, a download product's files, a course or community thumbnail. The file lives in the org's media library. A member reaches it only with content a grant covers.

**Member files.** A member uploads a profile photo, a post cover or a message attachment. The file belongs to that person. Ownership matters at write time. Who may see it follows the thing it is attached to: a post cover is visible to whoever can open the post, an attachment to the chat's participants, a photo to the org's members.

Both share the registry, the storage key, the presigned upload and download, the ready lifecycle, and deletion.

## Findings

### F1. `kind` meant two different things

**Where:** `packages/core/src/types/schemas/assets.ts:4`, `apps/admin/src/app/(dashboard)/media/upload-to-storage.ts:15-19`, `packages/core/src/assets/service.ts:133-136`

Three values classified the bytes (`video`, `download`, `content`) and were chosen by the admin app from the browser file type, so a PNG was `content` and a PDF was `download`. The fourth, `image`, meant "a member uploaded this" and was forced by the member route. `ownsImage` keyed on it. The assets doc said kind is "what the object is used as", which matched neither.

**Decision:** `kind` is the media class and nothing else: `image`, `video`, `audio`, `document`. The server derives it from the content type at upload. The client no longer sends it. A new `source` column says where the file came from: `library` or `member`.

### F2. `uploaded_by` held two id spaces

**Where:** `packages/server/src/http/routes/assets.ts:61-62` stored `users.id`; `packages/server/src/http/routes/member/assets.ts:68` stored `org_users.id`; `ownsImage` compared against an org user id.

A staff upload could never pass the ownership check and the column could not be joined without knowing which route wrote it.

**Decision:** `uploaded_by` is the org user id for every asset. The migration converts existing library rows through `org_users`.

### F3. No constraints on member uploads

**Where:** `packages/server/src/http/schemas/assets.ts:42-45`, `packages/core/src/assets/service.ts:100-123`

No image content type was required and nothing checked size. A member could presign a multi-gigabyte `image/png` and the confirm step marked it ready from `stat` without looking.

**Decision:** The member upload request requires an `image/*` content type. The confirm step reads the real size and content type from storage and refuses, removing the object and the row, when the type is not an image or the size is over `MEMBER_IMAGE_MAX_BYTES`. The S3 PUT presign cannot enforce size, so confirm is where it is enforced.

### F4. No lifecycle for member files

A member who uploaded and never attached left a `ready` asset forever. Only staff could delete, so a member could not remove their own old profile photo file.

**Decision:** A member may delete their own upload while nothing references it. A system automation, `Remove unattached uploads`, runs hourly and removes member uploads older than one hour that nothing references.

### F5. The visibility rule lived in reporting's SQL

**Where:** `adapters/db/src/repositories/member.ts:236-320` (`assetVisible`)

One seven-branch query hardcoded the staff role list, copied the space-open rule and the grant-covers rule, and was the only statement of who may see a profile photo, a post cover or an attachment. `docs/domain/reporting.md:29` said asset URLs call the context that owns the operation; the route called reporting.

**Decision:** A member never asks for an asset by id alone. The URL request names what the asset is being served as, and the owning context's own reader decides: an activity's media through the course grant, a course or download or community thumbnail through that content's access, a post cover through the post read, a message attachment through the chat read, a profile photo through org membership. Reporting composes those readers and signs. `assetVisible` is deleted.

### F6. Profile photos could not cross orgs

A profile is global, the photo is org-scoped, and serving ran inside one org. Sarah's photo in org A is unreachable from org B's directory.

**Decision:** A photo is shown only inside the org it was uploaded in. In another org the person has no photo until they upload one there. The identity doc states this.

### F7. Member files filled the staff media library

`listAssets` returned every asset. The media screen filled with member photos and chat attachments.

**Decision:** The list takes a `source` filter and defaults to `library`.

### F8. The deletion rule was a database error

The service removed the bytes from storage first, then the registry delete failed on the foreign key. The object was gone and the row stayed.

**Decision:** The service checks references before touching storage and refuses with a conflict.

### F9. Events published the storage key

`asset.created`, `asset.ready` and `asset.deleted` carried `key`, the internal bucket path, to webhooks.

**Decision:** `key` is stripped from the public event data.

### F10. The docs were stale or silent

The assets doc said the image kind was not built. The spec never listed the member upload routes. No doc said that a member upload is a different thing from a library upload.

**Decision:** `docs/domain/assets.md` is rewritten around one registry and two sources. The reporting, identity and community spec lines that describe files are corrected.

## The model after this review

| Column | Meaning |
|---|---|
| `kind` | The media class, derived by the server from the content type: `image`, `video`, `audio`, `document` |
| `source` | Where the file came from: `library` (staff, the org's media) or `member` (a person's own upload) |
| `uploaded_by` | The org user who uploaded it, for both sources |
| `status` | `pending` until the upload is confirmed, then `ready` |

Who may do what:

| Operation | Library | Member |
|---|---|---|
| Upload | staff, any content type | any org user, `image/*` only |
| Confirm | staff | the uploader only; the file is copied to a key the upload ticket cannot reach, then its stored size and type are checked there |
| List | staff, the media library | staff, with `source=member` |
| Serve | signed in the response that returns the content a grant covers, inline lesson media included; signed in the library for staff | signed in the response that returns the post, message or profile it is attached to; never in the staff library |
| Delete | staff, when nothing references it | the uploader or staff, when nothing references it; the hourly sweep, which also removes stray objects under the uploads prefix once the ticket has expired |

A delete removes the registry row first, so the references decide atomically, and removes the stored object after commit.

## API changes

| Route | Change |
|---|---|
| `POST /api/uploads` | Body is `{ filename, contentType }`. `kind` is no longer accepted. `uploadedBy` is the staff org user |
| `GET /api/assets` | Query gains `source`, default `library` |
| `DELETE /api/assets/:id` | 409 when the asset is referenced |
| `POST /api/assets/:id/confirm` | 403 for a member upload |
| `POST /api/assets/:id/download-url` | Removed in the fifth pass |
| `POST /api/courses/:courseId/modules/:moduleId/activities`, `PATCH …/activities/:activityId` | 409, naming the ids, when an activity uses a file that is not a ready library file of the org |
| `POST /api/member/uploads` | `contentType` must match `image/*` |
| `DELETE /api/member/uploads/:id` | New. The uploader removes their own unreferenced upload |
| `POST /api/member/assets/:id/url` | Removed in the fifth pass |
| `GET /api/member/downloads/:downloadId/assets/:assetId` | Removed in the fifth pass |

`Asset` gains `source` and `url`, and no longer carries `key`. `kind` values are `image`, `video`, `audio`, `document`. Every response that returns a file carries its signed URL; the fields are listed in the serving files section of `docs/community-spec.md`.

## Third pass

Reviewed again on 2026-10-22 against the code at `f6fd57d`. F1, F2, F7 and F9 held. F3, F4, F5, F6, F8 and F10 were only partly done:

- **F3:** a member could re-upload past the size and type check after finalize.
- **F4:** the sweep opened a run every hour with nothing to do.
- **F5:** inline lesson media no longer reached students, and staff could sign any member file.
- **F6:** the directory still exposed a photo id from another org.
- **F8:** a check-then-delete race remained, and inline media did not count as a reference.
- **F10:** the docs stated things the code did not do.

The findings were fixed as follows.

| ID | Finding | Decision |
|---|---|---|
| F11 | Inline lesson media never reached students. The member URL needs an activity–asset link, and nothing created one for media in the editor content. The same gap let staff delete a file a lesson shows | The editor contract gains `assetIds(config)`; content-plate implements it; the admin save sends the editor's ids; content refuses ids that are not ready library files of the org |
| F12 | The size and type check could be bypassed by re-uploading to the presigned URL after finalize | Finalize copies the upload to a final key the ticket cannot reach |
| F13 | Confirming a ready asset again deleted the bytes of a referenced file | Confirm acts on pending uploads only |
| F14 | Check-then-delete race in delete, removeOwn and the sweep | Row first in the unit of work, a foreign-key refusal is a 409, the object after commit |
| F15 | Staff could sign and confirm any member file by id, DM attachments included | Refused; staff may still delete an unreferenced member file |
| F16 | The directory returned a photo id from another org | Only the photo uploaded in this org |
| F17 | The one-hour grace sat in the composition root | In assets core |
| F18 | Kind was not re-derived from the stored content type | It is |
| F19 | `confirmAsset` lacked its error response | It documents 403 |
| F20 | An invalid `MEMBER_IMAGE_MAX_BYTES` disabled the cap, and no template listed it | Validated at startup; in the env templates and the self-hosting docs |
| F21 | 0004 mapped kind by the old kind | By content type |
| F22 | reporting/member took a repository and had silent optional stubs | Required deps, the organizations service |
| F23 | Member responses carried the storage key | No file, upload or download response carries it; the automation run record keeps the full event, which the doc states |
| F24 | `assets.md` described checks the code did not do | Corrected |

## Fourth pass

The third-pass fixes were verified in the code, and these were found and fixed:

| ID | Finding | Decision |
|---|---|---|
| T1 | The size and type could still change between `stat` and `copy` | Copy first, then check the copy |
| T2 | The ticket kept accepting writes after finalize, leaving objects nothing removed | The storage port can list a prefix; the sweep removes objects under the org's uploads prefix that no row holds once the ticket has expired |
| T3 | A finalize that failed after the copy orphaned it | Withdrawn in the sixth pass: one final key per upload, so a retried finalize writes over it |
| T4 | Two finalizes at once returned 500 or a stale row | Withdrawn in the sixth pass: a finalize that finds the row ready returns it |
| T5 | A dangling inline id blocked every save with a message naming nothing | The conflict names the ids and the builder shows it |
| T6 | A file deleted during a save made the link insert a 500 | A 409 naming the file |
| T7 | The editor contract docs omitted `assetIds` | Documented |
| T8 | `assets.md` said no API response carries the key | It names the run record |
| T9 | A programmatic image cap was not validated | The assets service refuses it |


## Fifth pass

Reviewed on 2026-10-24. A file is served in the response that carries the content it belongs to. The per-file URL routes and everything built around them are removed.

| ID | Finding | Decision |
|---|---|---|
| V1 | A frontend got a file URL by sending `POST /api/member/assets/:id/url` with a `via` body, one request per file. A read was a POST, a page showed nothing until it had made one request per image, no URL could sit in markup, and every frontend had to know which reference to name for which file | Removed. Each context that answers a read asks assets to sign the files of what it returns, in one batch: `thumbnailUrl` on courses, downloads and communities, `assetUrls` on activities, `coverUrl` on posts, `imageUrl` on profiles, authors and directory entries, `attachments` on messages, `url` on download files, `url` and `downloadUrl` on library assets. Reporting's reference check, `AssetReference`, `DownloadTicket` and the per-asset signing methods are gone |
| V2 | Staff fetched a URL per file with `POST /api/assets/:id/download-url`: every library card, preview, thumbnail, picked asset and upload | Removed. Library list, get and confirm return `url` to show a ready library file and `downloadUrl` to save it under its filename; both are `null` for pending files and member uploads |
| V3 | A message response never said what was attached to it. The only way to reach an attachment was the removed route, given an id the client had no way to learn | Every message response carries `attachments`, `{ assetId, url }` in order, loaded for a page of messages in one query. A member gets none for a deleted message; staff working the queue see them |
| V4 | The download file link was a redirect route per file, and the admin fetched each file's details with one request per file | The download's file rows carry the stored `filename`, `contentType`, `size` and a `url` that saves the file under its display name, or its filename without one. The redirect route and the repository's per-file link check are gone |
| V5 | Lesson content stored the URL from save time, and the editor contract had an async `resolveAssetUrl` the Plate nodes awaited one by one during render | The contract takes `assetUrls`, the map the activity response carries. A config stores a media node's asset id and never its URL: Plate drops the URL from every config it hands back, and gives each asset node the served URL before the editor or the renderer reads it, so every node, the toolbar and the image preview see it. A save of the content sends exactly the editor's ids as the activity's links; a save that leaves the content alone leaves the links alone, and nothing keeps links the editor does not know |
| V6 | Post and message writes returned a bare row, so a client had to read the post or chat again to show a cover, a sender photo or an attachment | Every post and message response is the full view |
| V7 | Staff URLs lived for the storage default and member URLs for `DELIVERY_URL_EXPIRY` | One lifetime, `DELIVERY_URL_EXPIRY`, for every URL a response carries, 24 hours by default |
| V8 | Course, download and community thumbnails and a download's files were stored unchecked, so staff could point a course thumbnail at a member's message attachment and every student would be served it | Each must be a ready library file of the org; otherwise the write is refused with a 409 naming the ids |

## Sixth pass

Reviewed on 2026-10-26, with the API running against a live database and MinIO.

| ID | Finding | Decision |
|---|---|---|
| T3, T4, OP5 | A final key per attempt, the release of the copy when marking ready failed, and the re-read after a failed copy were machinery for races nobody had hit | Withdrawn. One final key per upload; the copy is checked; a refused upload leaves neither object behind; a finalize that finds the row ready returns it; a storage error propagates |
| V5 (part) | `refreshUrl` kept a hook in the editor contract for a video outliving its URL | Removed from the contract, the Plate plugin and the student app |
| Z3 | The profile photo body required the asset's org id from the client | The body takes `imageAssetId`; the org is the session's |
| Z4 | A member upload declared as `image/png` but stored with another content type was marked ready with the merged type string | Finalize refuses a stored type that differs from the declared one |

## Tracking

| ID | Title | Status |
|---|---|---|
| F1 | `kind` is the media class, `source` is the origin | completed |
| F2 | `uploaded_by` is the org user for every asset | completed |
| F3 | Member uploads are images with a size cap | completed in the third and fourth pass (F12, T1) |
| F4 | Member files can be deleted and are swept | completed in the third and fourth pass (F14, T2) |
| F5 | Serve through the reference | superseded in the fifth pass (V1): files are signed in the responses that carry them |
| F6 | Profile photo stays in its org | completed in the third pass (F16) |
| F7 | Library list defaults to library source | completed |
| F8 | Referenced assets refuse deletion before storage is touched | completed in the third pass (F11, F14) |
| F9 | Storage key stripped from public events | completed |
| F10 | Docs rewritten | completed in the third and fourth pass (F24, T7, T8) |
| F11–F24 | Third pass | completed |
| T1–T9 | Fourth pass | completed |
| V1–V8 | Fifth pass: files served in the responses that carry them | completed |
| OP5 | Concurrent finalize with a re-upload | withdrawn in the sixth pass: accepted |
