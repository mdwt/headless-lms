"use client";

import { showCaption } from "@platejs/caption/react";
import {
  openImagePreview,
  useMediaController,
  useMediaControllerDropDownMenu,
  useMediaControllerState,
} from "@platejs/media/react";
import { BlockMenuPlugin } from "@platejs/selection/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  CaptionsIcon,
  CircleArrowDownIcon,
  MoreHorizontalIcon,
  MoveUpRightIcon,
  ZoomInIcon,
} from "lucide-react";
import { KEYS, type TMediaElement, type TTextAlignProps } from "platejs";
import { useEditorRef, useElement } from "platejs/react";
import type { ComponentProps, Dispatch, SetStateAction } from "react";
import { toast } from "sonner";

import { useFixedToolbar } from "../hooks/use-host-slots";
import { cn } from "../lib/utils";
import { downloadFile } from "../lib/download-file";

import {
  DropdownMenu,
  DropdownMenuContent,
  type DropdownMenuProps,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  useOpenState,
} from "./dropdown-menu";
import { Toolbar, ToolbarButton, toolbarButtonVariants } from "./toolbar";

export function MediaToolbar({ className, ...props }: ComponentProps<typeof Toolbar>) {
  const fixed = useFixedToolbar();
  if (fixed) return null;

  return (
    <Toolbar
      className={cn(
        "group-data-[readonly=true]/editor:hidden",
        "top-1 right-1 opacity-0 group-hover/media:opacity-100",
        "group-has-data-[resizing=true]/media:opacity-0 group-has-data-[state=open]/media:opacity-100 group-data-[state=open]/context-menu:opacity-0",
      )}
      variant="media"
      {...props}
    >
      <MediaToolbarButtons />
    </Toolbar>
  );
}

const alignItems = [
  {
    icon: AlignLeft,
    value: "left",
  },
  {
    icon: AlignCenter,
    value: "center",
  },
  {
    icon: AlignRight,
    value: "right",
  },
];

type MediaToolbarVariant = "media" | "default";

export function MediaToolbarButtons({ variant = "media" }: { variant?: MediaToolbarVariant }) {
  const size = variant === "media" ? "none" : "sm";
  const editor = useEditorRef();
  const element = useElement<TMediaElement>();
  const state = useMediaControllerState();
  const { MediaControllerDropDownMenuProps: mediaToolbarDropDownMenuProps } =
    useMediaController(state);

  const handleDownload = () => {
    toast.promise(downloadFile(element.url, element.id || "file"), {
      error: "Download failed. Please try again.",
      loading: "Downloading...",
    });
  };

  return (
    <>
      <MediaAlignButton variant={variant} {...mediaToolbarDropDownMenuProps} />
      <ToolbarButton
        onClick={() => showCaption(editor, element)}
        size={size}
        tooltip="Caption"
        variant={variant}
      >
        <CaptionsIcon />
      </ToolbarButton>
      {element.type === KEYS.img && (
        <ToolbarButton
          onClick={() => {
            openImagePreview(editor, element);
          }}
          size={size}
          tooltip="Expand"
          variant={variant}
        >
          <ZoomInIcon />
        </ToolbarButton>
      )}

      {element.type === KEYS.img && (
        <ToolbarButton onClick={handleDownload} size={size} tooltip="Download" variant={variant}>
          <CircleArrowDownIcon />
        </ToolbarButton>
      )}

      {element.type !== KEYS.img && (
        <ToolbarButton
          onClick={() => {
            window.open(element.url, "_blank");
          }}
          size={size}
          tooltip="Original"
          variant={variant}
        >
          <MoveUpRightIcon />
        </ToolbarButton>
      )}

      <ToolbarButton
        onClick={(e) => {
          editor.getApi(BlockMenuPlugin).blockMenu.showContextMenu(element.id as string, {
            x: e.clientX,
            y: e.clientY,
          });
        }}
        size={size}
        tooltip="More actions"
        variant={variant}
      >
        <MoreHorizontalIcon />
      </ToolbarButton>
    </>
  );
}

function MediaAlignButton({
  children,
  variant,
  ...props
}: {
  setAlignOpen: Dispatch<SetStateAction<boolean>>;
  variant: MediaToolbarVariant;
} & DropdownMenuProps) {
  const editor = useEditorRef();
  const element = useElement<TMediaElement & TTextAlignProps>();
  const openState = useOpenState();

  const value = element.align ?? "left";

  const IconValue = alignItems.find((item) => item.value === value)?.icon ?? AlignLeft;

  useMediaControllerDropDownMenu({
    openState,
    setAlignOpen: props.setAlignOpen,
  });

  return (
    <DropdownMenu modal={false} {...openState} {...props}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton
          data-state={openState.open ? "open" : "closed"}
          size={variant === "media" ? "none" : "sm"}
          tooltip="Align"
          variant={variant}
        >
          <IconValue className="size-4" />
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className={cn(
          "min-w-0 p-0",
          variant === "media" && "rounded-md border-none bg-black/60 shadow-none",
        )}
        portal={false}
      >
        <DropdownMenuRadioGroup
          className="flex hover:bg-transparent"
          onValueChange={(value) => {
            editor.tf.setNodes({ align: value as any }, { at: element });
          }}
          value={value}
        >
          {alignItems.map(({ icon: Icon, value: itemValue }) => (
            <DropdownMenuRadioItem
              className={cn(
                toolbarButtonVariants({
                  size: variant === "media" ? "none" : "sm",
                  variant,
                }),
                variant === "media" && "size-[26px]",
                "opacity-60 hover:opacity-100 data-[state=checked]:bg-black/5 data-[state=checked]:opacity-100",
              )}
              hideIcon
              key={itemValue}
              value={itemValue}
            >
              <Icon className="size-4" />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
