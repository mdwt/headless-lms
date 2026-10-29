# Assets — Domain Spec

Owns the org's stored files: the registry of what exists, where it lives, who put it there, the upload flow, and the links files are served by. The bytes live in object storage; the registry lives here. Every other domain references a file by its asset id and never reads bytes.

## Scope

- Owns the **asset**: a registry entry for one stored object, its lifecycle, and the org-scoped location it lives under.
- Owns the upload flow and the short-lived links files are served by, so file bytes go straight between the client and storage.
- Owns the rule that a file nothing references may be deleted and a file something references may not.
- Owns nothing about the storage backend itself or the domain objects that reference an asset.

## Two sources, one registry

A file enters the registry from one of two places, and the `source` of an asset says which.

**Library.** Staff put files in the org's media library: a course video, an inline image, a download product's files, a course or community thumbnail. The file belongs to the org. A member reaches it only with content a grant covers: the activity that links it, the download that lists it, the course or community whose thumbnail it is.

**Member.** A person uploads a file of their own: a profile photo, a post cover, a message attachment. The file belongs to that person. Only they can finalize it or attach it. While nothing references it, they or staff may delete it. Who may see it follows the thing it is attached to.

Both sources share the registry row, the storage key, the presigned upload, the file links, the pending-to-ready lifecycle, and the deletion rule. They differ in who may upload, what is allowed, who owns the file, where it is listed, how it is served, and how it dies.

|                    | Library                                                                | Member                                                              |
| ------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Who uploads        | staff                                                                  | any org user                                                        |
| What is allowed    | any content type                                                       | images only, size-capped when finalized                             |
| Who owns it        | the org; `uploaded_by` records the staff org user                      | the uploading org user                                              |
| Where it is listed | the media library                                                      | `source=member` in the library, never by default                    |
| How it is served   | with the library to staff; with the content a grant covers to a member | with the profile, post or message it is attached to                 |
| Who deletes it     | staff, when nothing references it                                      | the uploader or staff, when nothing references it; the hourly sweep |

## Model

### Entities (persisted)

- **Asset** — the registry entry for a stored object: its org, storage location, filename, content type, size, `kind`, `source`, status, who uploaded it, and when. Every asset belongs to an org, and all access is scoped to that org.
  - `kind` is the media class and nothing else: `image`, `video`, `audio` or `document`. The server derives it from the content type at upload. The client never chooses it.
  - `source` is where the file came from: `library` or `member`.
  - `status` is `pending` until the upload is confirmed, then `ready`. Only a ready asset is ever served or attached.
  - `uploaded_by` is the org user who uploaded it, for both sources.

### Not persisted

- **Upload ticket** — a short-lived link handed to the client for a single upload. Generated on demand, never stored.
- **File link** — a stable link to a file in the place it belongs: a course, download or community thumbnail, a file an activity links, a file in a download, a post cover, a message attachment, a person's photo, a person's own upload, a library file. Every read that returns something holding a file carries the file's link. Each request to the link checks, with the domain that owns the thing, that the caller may see it, then redirects to a short-lived signed storage link. There is no request for a file by its asset id alone.

## Capabilities

- **Request an upload** — register a pending asset and hand back a short-lived upload link. Staff register library files. Any org user registers a member file, which must be an image.
- **Confirm an upload** — once the client has uploaded, read the stored object's size and content type from storage and mark the asset ready. The content type is the one stored with the object; the bytes are not inspected. The media class is derived again from it. A member file is first copied to a location its upload link does not reach, and its size and content type are read from that copy, so the upload cannot be replaced between the check and the move. A member file whose stored content type is not an image, or whose size is over the configured limit, is discarded instead, the upload and the copy both, and the caller is told why. Only the uploader confirms a member file; staff confirm library files. Only a pending asset is confirmed; confirming a ready one changes nothing, and two confirms of the same upload at once leave one ready file.
- **Serve a file** — once the domain that owns the thing has decided the caller may see it, hand back a short-lived signed storage link to the ready file: a plain link to display it, or a download link that saves under a given name. A download file's link lives a few minutes; every other link outlives a viewing. Staff fetch library files directly; a member file is fetched through what it is attached to, or by its uploader.
- **Browse the library** — list and read assets, scoped to the org. The list is the library unless `source=member` is asked for.
- **Remove an asset** — delete the registry entry, then the stored object. An asset still referenced by content, a post, a message or a profile cannot be removed: the references refuse the delete, and storage is not touched. Nothing that removes the referencing record removes the asset.
- **Remove own upload** — the uploader removes their own member file while nothing references it. Staff may remove it too, under the same rule.
- **Sweep unattached uploads** — a system automation runs hourly and removes member files older than an hour that nothing references. The hour is the assets domain's rule. A file attached while the sweep runs is kept. An upload link keeps working until it expires, even after its upload is confirmed or refused, so the sweep also removes any object in the org's member upload location that no asset holds and that was last written longer ago than an upload link lives.

## Boundaries

1. **assets → organizations** — every asset is scoped to an org and `uploaded_by` is an org user; an operation resolves the caller's active org before touching anything, and one org cannot see another's assets.
2. **assets ↔ content** — an activity references the assets it uses; a download lists its files; a course and a community reference a thumbnail. Assets owns the objects; content owns the structure. A member fetches those files through a stable link per file, which checks on every request that a grant covers the item.
3. **assets ↔ discussion** — a post references its cover and a message references its attachments. Both must be member images the author uploaded. They are fetched through a stable link per file, which checks on every request that the reader can open the post, takes part in the chat, or is staff reading a flagged message.
4. **assets ↔ identity** — a profile references its photo, which must be a member image the person uploaded. A profile is global and a photo belongs to an org, so the reference names the org as well as the asset. The photo is served only inside that org, to its org users.
5. **assets ↔ reporting** — `reporting/member` composes the courses, activities and downloads a member opens and the photos in the community directory; it hands out each file's stable link, never a signed one.
6. **assets ↔ automations** — the hourly sweep is a system automation whose action calls assets.
7. **assets ↔ entitlements** — assets never decides who may fetch a file. A member is handed a file only after entitlements has confirmed access to the content that uses it.

## Build state

Built and **persisted**, including both sources, the member upload path, file links on every read that returns a file, the deletion rule and the sweep.
