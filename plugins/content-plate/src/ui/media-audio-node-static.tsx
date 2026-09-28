import type { TAudioElement } from "platejs";
import { SlateElement, type SlateElementProps } from "platejs/static";

import type { ResolveAssetUrl } from "@headless-lms/editor";

import { freshMediaUrl } from "../lib/media-url";

export async function MediaAudioElementStatic({
  resolveAssetUrl,
  ...props
}: SlateElementProps<TAudioElement> & { resolveAssetUrl?: ResolveAssetUrl }) {
  const url = await freshMediaUrl(props.element, resolveAssetUrl);

  return (
    <SlateElement className="mb-1" {...props}>
      <figure className="group relative cursor-default">
        <div className="h-16">
          <audio className="size-full" controls src={url} />
        </div>
      </figure>
      {props.children}
    </SlateElement>
  );
}
