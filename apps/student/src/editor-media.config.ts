/**
 * Client-side media companion to `editor.config.tsx`. Deployers swapping
 * editors edit both files. Separate entry so player routes don't bundle the
 * editor itself.
 */
import type { EditorMediaModule } from "@headless-lms/editor-contract";
import { MediaProvider } from "@headless-lms/content-plate/media";

const editorMedia: EditorMediaModule = { MediaProvider };

export default editorMedia;
