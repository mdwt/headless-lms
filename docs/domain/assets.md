# Assets — Domain Spec

Owns the org's media library: tracked objects in storage (video, downloadable file, inline content) that domain objects (e.g. a lesson) reference by id. Bytes live in object storage; the registry lives in the domain.

## Scope

- Owns the **asset**: a registry row for one stored object, its lifecycle, and the org-scoped key it lives under.
- Owns the upload/serve flow via short-lived presigned URLs — bytes never transit the API.
- Does **not** own the storage backend (an adapter) or the domain objects that reference an asset.

## Model

- **Asset** — id, `orgId`, storage `key`, `kind` (`video | download | content`), `filename`, `contentType`, `size` (0 until confirmed), `status` (`pending | ready`), `uploadedBy`, `createdAt`.
- **UploadTicket** / **DownloadTicket** — a presigned URL (+ method/headers) plus the asset.
- Keys are constructed `org/<orgId>/<kind>/<id>/<sanitized-filename>`; org isolation is enforced by scoping every lookup to the caller's org (cross-org reads return null).

## Key operations

- **`requestUpload`** — register a `pending` asset and return a presigned **PUT** URL.
- **`confirm`** — `stat` the object in storage, capture size/content-type, mark `ready`.
- **`requestDownload`** — return a short-lived presigned **GET** URL (optional download filename).
- **`list`** / **`get`** — paged/filtered library reads, org-scoped.
- **`remove`** — delete the object from storage and the registry row.

## Boundaries

1. **assets ↔ storage adapter** — `AssetsServiceImpl` owns key construction and lifecycle; delegates object operations to the `ObjectStorage` port. Implemented by `MinioStorageAdapter` (MinIO / S3-compatible): private bucket, access only via presigned URLs.
2. **assets ↔ organizations** — every asset is org-scoped; routes resolve the session's active org to the domain org id before any operation.
3. **assets ↔ courses** — a lesson (owned by courses) references an asset by `assetId`; assets never reads curriculum.

## Build state

Implemented and **persisted** (`assets` table) plus the MinIO/S3 storage adapter. HTTP routes require an active-org session (`/api/uploads`, `/api/assets/:id/confirm`, library + download under `/api/assets`).
