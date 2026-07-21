# @headless-lms/editor-contract

Types-only contract for the swappable activity content editor. An editor
implementation (e.g. `@headless-lms/content-plate`) default-exports an
`EditorModule`; the admin app selects exactly one per deployment in its
`src/editor.config.tsx`. The backend stores the editor's output as an opaque
blob inside the activity's `settings` and never inspects it.

- `Editor` — client component (`'use client'` entry) receiving
  `{ initialConfig, onSave }`.
- `Renderer` — RSC-safe component rendering a stored config.
- `validate` — optional structural check run before saving.
- `meta.type` (+ optional `meta.version`) — unique format tag stored with
  every config; a renderer must refuse configs of a foreign type or version.

Ships TypeScript source (consumed via the workspace + Next `transpilePackages`).
