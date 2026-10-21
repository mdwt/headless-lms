# Assets — Domain Spec

Owns the org's media library: tracked objects in storage — video, downloadable files, inline content — that other domains reference. The bytes live in object storage; the registry of what exists lives here.

## Scope

- Owns the **asset**: a registry entry for one stored object, its lifecycle, and the org-scoped location it lives under.
- Owns the upload and serve flow through short-lived, single-use links, so file bytes go straight between the client and storage. Assets owns the registry and lifecycle; the object store holds the bytes.
- Owns nothing about the storage backend itself or the domain objects that reference an asset.

## Model

### Entities (persisted)

- **Asset** — the registry entry for a stored object: its org, storage location, filename, content type, size, kind, status (`pending` until the upload is confirmed, then `ready`), who uploaded it, and when. Every asset belongs to an org, and all access is scoped to that org. The kind says what the object is used as: video, a downloadable file, inline content, and, with the community feature, an image — a post's cover, a message attachment, a person's profile photo.

### Not persisted

- **Upload / download ticket** — a short-lived link handed to the client for a single upload or download. Generated on demand, never stored.

## Capabilities

- **Request an upload** — register a pending asset and hand back a short-lived upload link.
- **Confirm an upload** — once the client has uploaded, capture the object's real size and content type and mark the asset ready.
- **Request a download** — hand back a short-lived download link.
- **Browse the library** — list and read assets, scoped to the org.
- **Remove an asset** — delete both the stored object and its registry entry. An asset still referenced by content, a post, a message or a profile cannot be removed; the reference is unlinked first. Nothing that removes the referencing record removes the asset.

## Boundaries

1. **assets → organizations** — every asset is scoped to an org; an operation resolves the caller's active org before touching anything, and one org cannot see another's assets.
2. **assets ↔ content** — an activity references the assets it uses; an activity can reference many, and an asset can be used by many activities. A course and a community reference a thumbnail. Assets owns the objects; content owns the structure.
3. **assets ↔ discussion** — a post references its cover and a message references its attachments. Serving an attachment is gated the same way the message is: only the chat's participants, and staff reading a flagged message.
4. **assets ↔ identity** — a profile references its photo. A profile is global and a photo belongs to an org, so the reference names the org as well as the asset.

## Build state

Built and **persisted**. The image kind and the post, message and profile references are specified with the community feature and are not built yet.
