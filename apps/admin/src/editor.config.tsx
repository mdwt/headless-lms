/**
 * The editor swap point. Exactly one editor implementation is installed and
 * bundled per deployment; deployers change editors by editing ONLY this file
 * (and the dependency + `transpilePackages` entry it points at). Routes import
 * from `@/editor.config` — never from an editor package directly.
 *
 * The `EditorModule` annotation is the enforcement: a default export that
 * doesn't satisfy the contract fails `next build` typecheck at this file.
 */
import type { EditorModule } from "@headless-lms/editor-contract";
import plateEditor from "@headless-lms/content-plate";

const editorModule: EditorModule = plateEditor;

export default editorModule;
