# @headless-lms/content-plate

Notion-style [Plate](https://platejs.org) implementation of the swappable
activity content editor (`@headless-lms/editor`). Default-exports an
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
  formatting toolbar, autoformat shortcuts (`#`, `>`, ` ``` `, `-` …),
  block placeholders.

## Layout

```
src/
  index.ts          # contract assembly (EditorModule)
  editor.tsx        # 'use client' contract Editor — Plate + EditorKit + Save
  renderer.tsx      # RSC-safe contract Renderer — PlateStatic + BaseEditorKit
  validate.ts       # shallow node-array check
  asset-ids.ts      # contract assetIds — host asset ids the content shows
  asset-urls.ts     # applies the host's assetUrls to asset-backed nodes
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

## Asset links

The contract's required `assetIds(config)` returns every `assetId` on a node of
the config, in document order, without duplicates. When an activity's content
is saved, the admin sends exactly these ids as the activity's asset links; the
server accepts only ready media library files of the org. A media node without
an `assetId` (a non-persistent local preview) is not linked.

## Asset URLs

The API returns each activity with `assetUrls`, a signed URL per linked file
keyed by asset id, and the host passes it to `Editor` and `Renderer` as
`assetUrls`. A stored config holds a media node's `assetId` and never its URL.
Both entries give every asset node the URL from the map before rendering, and
an asset node the host did not serve has none. The editor drops the URL of
every asset node from the configs it hands to `onSave` and `onChange`. External
media keeps its own `url`.

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
