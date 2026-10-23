# Assets review

Reviewed on 2026-10-22 on branch `feature/community-impl` at `4144428`, against `docs/domain/assets.md`, `docs/domain/content.md`, `docs/domain/reporting.md`, `docs/domain/identity.md`, `docs/community-spec.md` and `docs/community-exploration.md`.

The question under review: the assets context serves two different uses, product files that staff put in the library and files that members upload for their own profile, posts and messages. Both belong in one context. This document records where the model, the code and the docs did not say how one registry serves both, the decisions taken, and the state of each fix.

## The two uses

**Library files.** Staff upload a course video, an inline image, a download product's files, a course or community thumbnail. The file lives in the org's media library. A member reaches it only through content a grant covers. The download route is the clean example on `main`: `/api/member/downloads/:downloadId/assets/:assetId` checks the grant on the download, then that the download links the file, then signs.

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
| Serve | through the content a grant covers, inline lesson media included; staff by id | through the post, message or profile that references it; never to staff by id |
| Delete | staff, when nothing references it | the uploader or staff, when nothing references it; the hourly sweep, which also removes stray objects under the uploads prefix once the ticket has expired |

A delete removes the registry row first, so the references decide atomically, and removes the stored object after commit.

## API changes

| Route | Change |
|---|---|
| `POST /api/uploads` | Body is `{ filename, contentType }`. `kind` is no longer accepted. `uploadedBy` is the staff org user |
| `GET /api/assets` | Query gains `source`, default `library` |
| `DELETE /api/assets/:id` | 409 when the asset is referenced |
| `POST /api/assets/:id/confirm` | 403 for a member upload |
| `POST /api/assets/:id/download-url` | 403 for a member upload |
| `POST /api/courses/:courseId/modules/:moduleId/activities`, `PATCH …/activities/:activityId` | 409, naming the ids, when an activity uses a file that is not a ready library file of the org |
| `POST /api/member/uploads` | `contentType` must match `image/*` |
| `DELETE /api/member/uploads/:id` | New. The uploader removes their own unreferenced upload |
| `POST /api/member/assets/:id/url` | Body is a required reference: `{ via: { activity } | { course } | { download } | { community } | { post } | { message } | { profile } }` |

`Asset` gains `source` and no longer carries `key`. `kind` values are `image`, `video`, `audio`, `document`.

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
| T3 | A finalize that failed after the copy orphaned it | The final key is unique per attempt and removed when marking ready fails |
| T4 | Two finalizes at once returned 500 or a stale row | A failed copy re-reads the row |
| T5 | A dangling inline id blocked every save with a message naming nothing | The conflict names the ids and the builder shows it |
| T6 | A file deleted during a save made the link insert a 500 | A 409 naming the file |
| T7 | The editor contract docs omitted `assetIds` | Documented |
| T8 | `assets.md` said no API response carries the key | It names the run record |
| T9 | A programmatic image cap was not validated | The assets service refuses it |

Open, for the next run: two concurrent finalizes of one upload with a re-upload in between can refuse the new bytes and delete the row the other made ready (OP5 in `docs/community-code-review.md`).

## Tracking

| ID | Title | Status |
|---|---|---|
| F1 | `kind` is the media class, `source` is the origin | completed |
| F2 | `uploaded_by` is the org user for every asset | completed |
| F3 | Member uploads are images with a size cap | completed in the third and fourth pass (F12, T1) |
| F4 | Member files can be deleted and are swept | completed in the third and fourth pass (F14, T2) |
| F5 | Serve through the reference | completed in the third pass (F11, F15) |
| F6 | Profile photo stays in its org | completed in the third pass (F16) |
| F7 | Library list defaults to library source | completed |
| F8 | Referenced assets refuse deletion before storage is touched | completed in the third pass (F11, F14) |
| F9 | Storage key stripped from public events | completed |
| F10 | Docs rewritten | completed in the third and fourth pass (F24, T7, T8) |
| F11–F24 | Third pass | completed |
| T1–T9 | Fourth pass | completed |
| OP5 | Concurrent finalize with a re-upload | open |
