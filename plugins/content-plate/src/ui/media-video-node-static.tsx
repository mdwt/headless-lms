import {
  NodeApi,
  type TCaptionElement,
  type TResizableProps,
  type TVideoElement,
} from 'platejs';
import { SlateElement, type SlateElementProps } from 'platejs/static';
import * as React from 'react';

import { MediaVideoPlayer } from './media-video-player';

export function MediaVideoElementStatic(
  props: SlateElementProps<TVideoElement & TCaptionElement & TResizableProps>
) {
  const { align = 'center', caption, url, width } = props.element;
  // Stable asset reference persisted by the upload flow; absent on external URLs.
  const assetId = (props.element as { assetId?: unknown }).assetId;

  return (
    <SlateElement className="py-2.5" {...props}>
      <div style={{ textAlign: align }}>
        <figure
          className="group relative m-0 inline-block cursor-default"
          style={{ width }}
        >
          <MediaVideoPlayer
            assetId={typeof assetId === 'string' ? assetId : undefined}
            url={url}
          />
          {caption && <figcaption>{NodeApi.string(caption[0])}</figcaption>}
        </figure>
      </div>
      {props.children}
    </SlateElement>
  );
}
