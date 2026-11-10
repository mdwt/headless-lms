---
"@headless-lms/core": minor
"@headless-lms/server": minor
"@headless-lms/sdk": minor
"@headless-lms/adapter-db": minor
---

A space has an optional cover, background and icon, each a ready image from the media library: `coverAssetId`, `backgroundAssetId` and `iconAssetId` on the space update, `null` to clear one, and `coverUrl`, `backgroundUrl` and `iconUrl` on the space. The images of a space in a published community are public; otherwise they are served through access-checked file links.
