# @headless-lms/content-plate

Notion-style [Plate](https://platejs.org) implementation of the swappable
activity content editor (`@headless-lms/editor-contract`). Default-exports an
`EditorModule` with `meta: { type: 'plate', version: 1 }`; the config blob is
the Plate/Slate node array (`editor.children`), stored opaquely by the backend.

## What's included

- **Text blocks** — paragraphs, headings, blockquote, code block (lowlight
  highlighting), bulleted/numbered/to-do lists, toggle, callout, columns,
  table, date, emoji, links, font/background color.
- **Media** — image, video, audio, file and URL embeds, with captions,
  resize, preview dialog, and upload placeholders.
- **Notion-style UX** — `/` slash command menu to insert any block, drag
  handles + drop targets (dnd), multi-block selection, right-click block
  context menu (turn into, color, align, duplicate, delete), floating
  formatting toolbar, autoformat shortcuts (`#`, `>`, `` ``` ``, `-` …),
  block placeholders.


## Layout

```
src/
  index.ts          # contract assembly (EditorModule)
  editor.tsx        # 'use client' contract Editor — Plate + EditorKit + Save
  renderer.tsx      # RSC-safe contract Renderer — PlateStatic + BaseEditorKit
  validate.ts       # shallow node-array check
  editor/
    editor-kit.tsx        # assembled interactive plugin kit
    editor-base-kit.tsx   # assembled static (server) kit
    plugins/              # one kit per feature
    transforms.ts         # insert/turn-into transforms behind slash & menus
  ui/               # node + toolbar + menu components
  hooks/            # shared hooks; use-upload-file.tsx bridges host uploads
  lib/              # cn() + download helper
```

`editor/plugins/`, `ui/`, `hooks/`, `lib/` follow the standard Plate registry
layout (they're exempt from repo lint; `noUncheckedIndexedAccess` is off in
this package). The contract entry files live at `src/*.ts[x]`.

## Media uploads

Uploads go through the **host app's media API**, not the package: the contract's
`PageEditorProps.uploadFile` is provided by the host (the admin app wires it to
`POST /api/uploads` → presigned PUT to storage → `POST /api/assets/:id/confirm`)
and `hooks/use-upload-file.tsx` exposes it to the media components via
`UploadProvider`. Without a handler, files fall back to non-persistent local
object URLs.

## Styling

Components are Tailwind-styled and rely on the host's theme tokens (shadcn
semantics + a few extras: `brand-foreground`, `brand-active`, `highlight`,
`subtle-foreground`, `shadow-toolbar`, `animate-popover/zoom`,
`scrollbar-hide`). The admin app maps these onto its palette in `globals.css`
and scans this package via `@source`.

Ships TS source: the consuming Next app lists it (and the contract) in
`transpilePackages`, which keeps `'use client'` directives intact.

Swap point: `apps/admin/src/editor.config.tsx` is the only file in the admin
app that imports this package.
