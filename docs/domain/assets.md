# Assets — Domain Spec

Owns the org's media library: tracked objects in storage — video, downloadable files, inline content — that other domains reference. The bytes live in object storage; the registry of what exists lives here.

## Scope

- Owns the **asset**: a registry entry for one stored object, its lifecycle, and the org-scoped location it lives under.
- Owns the upload and serve flow through short-lived, single-use links, so file bytes go straight between the client and storage. Assets owns the registry and lifecycle; the object store holds the bytes.
- Owns nothing about the storage backend itself or the domain objects that reference an asset.

## Model

### Entities (persisted)

- **Asset** — the registry entry for a stored object: its org, storage location, filename, content type, size, status (`pending` until the upload is confirmed, then `ready`), who uploaded it, and when. Every asset belongs to an org, and all access is scoped to that org.

### Not persisted

- **Upload / download ticket** — a short-lived link handed to the client for a single upload or download. Generated on demand, never stored.

## Capabilities

- **Request an upload** — register a pending asset and hand back a short-lived upload link.
- **Confirm an upload** — once the client has uploaded, capture the object's real size and content type and mark the asset ready.
- **Request a download** — hand back a short-lived download link.
- **Browse the library** — list and read assets, scoped to the org.
- **Remove an asset** — delete both the stored object and its registry entry.

## Boundaries

1. **assets → organizations** — every asset is scoped to an org; an operation resolves the caller's active org before touching anything, and one org cannot see another's assets.
2. **assets ↔ courses** — a lesson (owned by courses) references the assets it uses; a lesson can reference many, and an asset can be used by many lessons. Assets owns the objects; courses owns the curriculum.

## Build state

Built and **persisted**.
