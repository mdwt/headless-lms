import type { ReactNode } from "react";

// Placeholder slot for an activity's content. The Plate content is rendered on
// the server (see `render-activity.tsx`) and passed in as a ready-made node, so
// this client-side wrapper never re-executes the editor's Renderer.
export function ContentArea({ node }: { node: ReactNode }) {
  return <>{node}</>;
}
