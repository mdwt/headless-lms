import { NodeApi, type TCaptionElement, type TImageElement, type TResizableProps } from "platejs";
import { SlateElement, type SlateElementProps } from "platejs/static";

import type { ResolveAssetUrl } from "@headless-lms/editor";

import { freshMediaUrl } from "../lib/media-url";

export async function ImageElementStatic({
  resolveAssetUrl,
  ...props
}: SlateElementProps<TImageElement & TCaptionElement & TResizableProps> & {
  resolveAssetUrl?: ResolveAssetUrl;
}) {
  const { align = "center", caption, width } = props.element;
  const url = await freshMediaUrl(props.element, resolveAssetUrl);

  return (
    <SlateElement className="py-2.5" {...props}>
      <figure className="group relative m-0 inline-block">
        <div className="relative min-w-[92px] max-w-full" style={{ textAlign: align }}>
          <div className="inline-block" style={{ width }}>
            <img
              alt={(props.attributes as any).alt}
              className="w-full max-w-full cursor-default rounded-sm object-cover px-0"
              src={url}
            />
            {caption && (
              <figcaption className="mx-auto mt-2 h-[24px] max-w-full">
                {NodeApi.string(caption[0])}
              </figcaption>
            )}
          </div>
        </div>
      </figure>
      {props.children}
    </SlateElement>
  );
}
