# Assets — Domain Spec

Owns the org's stored files: the registry of what exists, where it lives, who put it there, and the upload and serve flow. The bytes live in object storage; the registry lives here. Every other domain references a file by its asset id and never reads bytes.

## Scope

- Owns the **asset**: a registry entry for one stored object, its lifecycle, and the org-scoped location it lives under.
- Owns the upload and serve flow through short-lived links, so file bytes go straight between the client and storage.
- Owns the rule that a file nothing references may be deleted and a file something references may not.
- Owns nothing about the storage backend itself or the domain objects that reference an asset.

## Two sources, one registry

A file enters the registry from one of two places, and the `source` of an asset says which.

**Library.** Staff put files in the org's media library: a course video, an inline image, a download product's files, a course or community thumbnail. The file belongs to the org. A member reaches it only through content a grant covers: the activity that links it, the download that lists it, the course or community whose thumbnail it is.

**Member.** A person uploads a file of their own: a profile photo, a post cover, a message attachment. The file belongs to that person. Only they can finalize it, attach it, or delete it. Who may see it follows the thing it is attached to.

Both sources share the registry row, the storage key, the presigned upload and download, the pending-to-ready lifecycle, and the deletion rule. They differ in who may upload, what is allowed, who owns the file, where it is listed, how it is served, and how it dies.

| | Library | Member |
|---|---|---|
| Who uploads | staff | any org user |
| What is allowed | any content type | images only, size-capped when finalized |
| Who owns it | the org; `uploaded_by` records the staff org user | the uploading org user |
| Where it is listed | the media library | `source=member` in the library, never by default |
| How it is served | through the content a grant covers | through the profile, post or message it is attached to |
| Who deletes it | staff, when nothing references it | the uploader, when nothing references it; the hourly sweep |

## Model

### Entities (persisted)

- **Asset** — the registry entry for a stored object: its org, storage location, filename, content type, size, `kind`, `source`, status, who uploaded it, and when. Every asset belongs to an org, and all access is scoped to that org.
  - `kind` is the media class and nothing else: `image`, `video`, `audio` or `document`. The server derives it from the content type at upload. The client never chooses it.
  - `source` is where the file came from: `library` or `member`.
  - `status` is `pending` until the upload is confirmed, then `ready`. Only a ready asset is ever served or attached.
  - `uploaded_by` is the org user who uploaded it, for both sources.

### Not persisted

- **Upload / download ticket** — a short-lived link handed to the client for a single upload or download. Generated on demand, never stored.
- **Reference** — what an asset is being served as: an activity's media, a course, download or community thumbnail, a post's cover, a message's attachment, a person's photo. A member never asks for an asset by id alone; the request names the reference, and the domain that owns it decides.

## Capabilities

- **Request an upload** — register a pending asset and hand back a short-lived upload link. Staff register library files. Any org user registers a member file, which must be an image.
- **Confirm an upload** — once the client has uploaded, read the object's real size and content type from storage and mark the asset ready. A member file whose stored bytes are not an image, or are over the configured limit, is discarded instead and the caller is told why. Only the uploader confirms a member file.
- **Serve** — hand back a short-lived download link. Staff serve any library file. A member is served a file through a reference, after the owning domain has said the member may see the thing referenced and that it references this asset.
- **Browse the library** — list and read assets, scoped to the org. The list is the library unless `source=member` is asked for.
- **Remove an asset** — delete both the stored object and its registry entry. An asset still referenced by content, a post, a message or a profile cannot be removed; the request is refused before storage is touched. Nothing that removes the referencing record removes the asset.
- **Remove own upload** — the uploader removes their own member file while nothing references it.
- **Sweep unattached uploads** — a system automation runs hourly and removes member files older than an hour that nothing references.

## Boundaries

1. **assets → organizations** — every asset is scoped to an org and `uploaded_by` is an org user; an operation resolves the caller's active org before touching anything, and one org cannot see another's assets.
2. **assets ↔ content** — an activity references the assets it uses; a download lists its files; a course and a community reference a thumbnail. Assets owns the objects; content owns the structure. Serving to a member goes through content's access rule for the referencing item.
3. **assets ↔ discussion** — a post references its cover and a message references its attachments. Both must be member images the author uploaded. Serving goes through discussion's read of the post or the message: whoever can open the post, the chat's participants, and staff reading a flagged message.
4. **assets ↔ identity** — a profile references its photo, which must be a member image the person uploaded. A profile is global and a photo belongs to an org, so the reference names the org as well as the asset. The photo is served only inside that org, to its org users.
5. **assets ↔ reporting** — `reporting/member` composes the serve-by-reference read: it asks the owning domain whether the member may see the referenced thing, checks the reference, and asks assets to sign.
6. **assets ↔ automations** — the hourly sweep is a system automation whose action calls assets.

## Events

- `asset.created`, `asset.ready`, `asset.deleted` — the asset row without its storage key. The key is internal and never leaves the system.

## Build state

Built and **persisted**, including both sources, the member upload and serve path, the reference-gated member URL, the deletion rule and the sweep.
