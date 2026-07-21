// Entry point — no directive. Assembles the EditorModule: the host app's RSC
// routes reach `Renderer`/`meta`/`validate` directly, while `Editor` (whose
// entry file is 'use client') becomes a client reference across the boundary.
import type { EditorModule } from "@headless-lms/editor-contract";

import { Editor } from "./editor";
import { Renderer } from "./renderer";
import { validate } from "./validate";

const plateEditor: EditorModule = {
  Editor,
  Renderer,
  validate,
  meta: { type: "plate", version: 1 },
};

export default plateEditor;
