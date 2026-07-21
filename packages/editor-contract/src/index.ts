// The swappable-editor contract. Types only — no editor code, no runtime deps.
// An installation picks its editor by assigning a package's default export to
// this interface in one convention file (the admin app's `editor.config.tsx`);
// a non-conforming editor fails typecheck at that file.
import type { ComponentType } from "react";

export interface PageEditorProps {
  /** The stored editor config blob, verbatim. `null`/invalid → start empty. */
  initialConfig: unknown;
  /** Persist the current config. The editor awaits this for pending state. */
  onSave: (config: unknown) => Promise<void>;
}

export interface EditorModule {
  /** Client component. Entry file must have 'use client'. */
  Editor: ComponentType<PageEditorProps>;
  /** Entry must be RSC-safe: no 'use client', no hooks/browser APIs at top level.
   *  May render 'use client' islands internally. Props passed into islands must be
   *  serializable; composition across the boundary only via children. */
  Renderer: ComponentType<{ config: unknown }>;
  validate?: (config: unknown) => { ok: true } | { ok: false; errors: string[] };
  meta: {
    /** Unique identifier for this editor's config format, stored with every
     *  config. Renderers refuse configs of a foreign type. */
    type: string;
    /** Bump on breaking changes to the config shape; a version mismatch is
     *  treated the same as a foreign type. */
    version?: number;
  };
}
