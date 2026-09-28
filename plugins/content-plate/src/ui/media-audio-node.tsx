"use client";

import { useMediaState } from "@platejs/media/react";
import { ResizableProvider } from "@platejs/resizable";
import { PlateElement, type PlateElementProps, withHOC } from "platejs/react";

import { useFreshMediaUrl } from "../hooks/use-resolve-asset-url";

import { Caption, CaptionTextarea } from "./caption";

export const MediaAudioElement = withHOC(
  ResizableProvider,
  function MediaAudioElement(props: PlateElementProps) {
    const { align = "center", readOnly, unsafeUrl } = useMediaState();
    const freshUrl = useFreshMediaUrl(props.element);

    return (
      <PlateElement className="mb-1" {...props}>
        <figure className="group relative" contentEditable={false}>
          <div className="h-16">
            <audio className="size-full" controls src={freshUrl ?? unsafeUrl} />
          </div>

          <Caption align={align} style={{ width: "100%" }}>
            <CaptionTextarea
              className="h-20"
              placeholder="Write a caption..."
              readOnly={readOnly}
            />
          </Caption>
        </figure>
        {props.children}
      </PlateElement>
    );
  },
);
