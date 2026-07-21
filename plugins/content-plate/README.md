# @headless-lms/content-plate

[Plate](https://platejs.org) implementation of the swappable activity content
editor (`@headless-lms/editor-contract`). Default-exports an `EditorModule`
with `type: 'plate', version: 1` — the config blob is the Plate/Slate
node array (`editor.children`), stored opaquely by the backend.

- `src/editor.tsx` (`'use client'`) — `usePlateEditor` with basic nodes
  (headings, bold/italic, paragraph), a minimal toolbar, and a Save button
  that calls `onSave(editor.children)`.
- `src/renderer.tsx` (RSC-safe, no directive) — `createSlateEditor` +
  `PlateStatic`, so rendering stored content ships no editor JS.
- `src/validate.ts` — shallow structural check (array of nodes with
  `children` arrays).

Ships TypeScript source: the consuming Next app lists it (and the contract) in
`transpilePackages`, which keeps the `'use client'` directives intact. The
host app must depend on `react`/`react-dom` (peers).

Swap point: `apps/admin/src/editor.config.tsx` is the only file in the admin
app that imports this package.
