// Course cover gradients (handoff). Deep tonal covers; swap for real thumbnails.
import type { CoverTone } from "./types";

export const COVER_GRADIENTS: Record<CoverTone, string> = {
  indigo: "linear-gradient(150deg, #211d44, #332b6b)",
  slate: "linear-gradient(150deg, #1b2734, #2c3e50)",
  teal: "linear-gradient(150deg, #10302d, #1d4a43)",
  espresso: "linear-gradient(150deg, #2b2119, #3f3025)",
  plum: "linear-gradient(150deg, #251a2c, #3c2946)",
  ink: "linear-gradient(150deg, #1d1e22, #2c2e36)",
};

export function coverGradient(tone: CoverTone): string {
  return COVER_GRADIENTS[tone];
}

/** Faint cover initial — the title initial, ignoring a leading article. */
export function coverLetter(title: string): string {
  const stripped = title.replace(/^(the|a|an)\s+/i, "");
  return (stripped[0] ?? title[0] ?? "").toUpperCase();
}
