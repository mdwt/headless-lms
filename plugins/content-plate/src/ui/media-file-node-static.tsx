import { FileUp } from "lucide-react";

import type { TFileElement } from "platejs";
import { SlateElement, type SlateElementProps } from "platejs/static";

import type { ResolveAssetUrl } from "@headless-lms/editor";

import { freshMediaUrl } from "../lib/media-url";

export async function MediaFileElementStatic({
  resolveAssetUrl,
  ...props
}: SlateElementProps<TFileElement> & { resolveAssetUrl?: ResolveAssetUrl }) {
  const { name } = props.element;
  const url = await freshMediaUrl(props.element, resolveAssetUrl);

  return (
    <SlateElement className="my-px rounded-sm" {...props}>
      <a
        className="group relative m-0 flex cursor-pointer items-center rounded px-0.5 py-[3px] hover:bg-muted"
        contentEditable={false}
        download={name}
        href={url}
        rel="noopener noreferrer"
        role="button"
        target="_blank"
      >
        <div className="flex items-center gap-1 p-1">
          <FileUp className="size-5" />
          <div>{name}</div>
        </div>
      </a>

      {props.children}
    </SlateElement>
  );
}
