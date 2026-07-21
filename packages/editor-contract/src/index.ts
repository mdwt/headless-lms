// The swappable-editor contract. Types only — no editor code, no runtime deps.
// An installation picks its editor by assigning a package's default export to
// this interface in one convention file (the admin app's `editor.config.tsx`);
// a non-conforming editor fails typecheck at that file.
import type { ComponentType } from "react";

/** Result of a host-side media upload, referenced from editor content. */
export interface UploadedEditorFile {
  /** Host-side asset id ("" if the host doesn't track assets). */
  id: string;
  name: string;
  size: number;
  type: string;
  /** URL the editor embeds to display the media. */
  url: string;
}

export interface PageEditorProps {
  /** The stored editor config blob, verbatim. `null`/invalid → start empty. */
  initialConfig: unknown;
  /** Persist the current config. The editor awaits this for pending state. */
  onSave: (config: unknown) => Promise<void>;
  /**
   * Fired with the current config on every edit. Lets the host own the save
   * UI (header save button, autosave, dirty indicator) instead of the editor
   * rendering its own chrome.
   */
  onChange?: (config: unknown) => void;
  /**
   * Host-provided media upload, wired to the host's own media API (for the
   * LMS admin: POST /api/uploads → presigned PUT → confirm). Editors that
   * support media call this and embed the returned URL; when absent, editors
   * may fall back to non-persistent local previews.
   */
  uploadFile?: (
    file: File,
    opts: { onProgress?: (fraction: number) => void },
  ) => Promise<UploadedEditorFile>;
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
