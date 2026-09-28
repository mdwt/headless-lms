"use client";

import { setMediaNode } from "@platejs/media";
import {
  PlaceholderPlugin,
  PlaceholderProvider,
  usePlaceholderElementState,
  usePlaceholderPopoverState,
} from "@platejs/media/react";
import { AudioLinesIcon, FileUpIcon, FilmIcon, ImageIcon } from "lucide-react";
import { KEYS } from "platejs";
import { PlateElement, type PlateElementProps, useEditorPlugin, withHOC } from "platejs/react";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { toast } from "sonner";
import { useFilePicker } from "use-file-picker";

import { cn } from "../lib/utils";
import { type PickAssetKind, usePickAsset } from "../hooks/use-pick-asset";
import { getErrorMessage, type UploadedFile, useUploadFile } from "../hooks/use-upload-file";

import { BlockActionButton } from "./block-context-menu";
import { Button } from "./button";
import { Input } from "./input";
import { mediaNodeProps } from "./media-node-props";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Spinner } from "./spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

const CONTENT: Record<
  string,
  {
    content: ReactNode;
    icon: ReactNode;
  }
> = {
  [KEYS.audio]: {
    content: "Add an audio file",
    icon: <AudioLinesIcon />,
  },
  [KEYS.file]: {
    content: "Add a file",
    icon: <FileUpIcon />,
  },
  [KEYS.img]: {
    content: "Add an image",
    icon: <ImageIcon />,
  },
  [KEYS.video]: {
    content: "Add a video",
    icon: <FilmIcon />,
  },
};

export const PlaceholderElement = withHOC(PlaceholderProvider, (props: PlateElementProps) => {
  const { mediaType, progresses, progressing, setSize, updatedFiles } =
    usePlaceholderElementState();

  const currentContent = CONTENT[mediaType];

  const isImage = mediaType === KEYS.img;

  const file: File | undefined = updatedFiles?.[0];
  const progress = file ? progresses?.[file.name] : undefined;

  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!imageRef.current) return;

    const { height, width } = imageRef.current;

    setSize?.({
      height,
      width,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageRef.current]);

  return (
    <PlateElement className="my-1" {...props}>
      <MediaPlaceholderPopover>
        {(!progressing || !isImage) && (
          <div
            className={cn(
              "flex cursor-pointer select-none items-center rounded-sm bg-muted p-3 pr-9 transition-bg-ease hover:bg-primary/10",
            )}
            contentEditable={false}
            role="button"
          >
            <div className="relative mr-3 flex text-muted-foreground/80 [&_svg]:size-6">
              {currentContent.icon}
            </div>
            <div className="whitespace-nowrap text-muted-foreground text-sm">
              <div>{progressing ? file?.name : currentContent.content}</div>

              {progressing && !isImage && (
                <div className="mt-1 flex items-center gap-1.5">
                  <div>{formatBytes(file.size)}</div>
                  <div>–</div>
                  <div className="flex items-center">
                    <Spinner className="mr-1 size-3.5" />
                    {progress ?? 0}%
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </MediaPlaceholderPopover>

      {isImage && progressing && file && (
        <ImageProgress file={file} imageRef={imageRef} progress={progress} />
      )}

      <BlockActionButton />

      {props.children}
    </PlateElement>
  );
});

const MEDIA_CONFIG: Record<
  string,
  {
    accept: string[];
    browseText: string;
    buttonText: string;
    embedText: string;
    pickKind: PickAssetKind;
  }
> = {
  [KEYS.audio]: {
    accept: ["audio/*"],
    browseText: "Browse library",
    buttonText: "Upload Audio",
    embedText: "Embed audio",
    pickKind: "audio",
  },
  [KEYS.file]: {
    accept: ["*"],
    browseText: "Browse library",
    buttonText: "Choose a file",
    embedText: "Embed file",
    pickKind: "file",
  },
  [KEYS.img]: {
    accept: ["image/*"],
    browseText: "Browse library",
    buttonText: "Upload file",
    embedText: "Embed image",
    pickKind: "image",
  },
  [KEYS.video]: {
    accept: ["video/*"],
    browseText: "Browse library",
    buttonText: "Upload video",
    embedText: "Embed video",
    pickKind: "video",
  },
};

function MediaPlaceholderPopover({ children }: { children: ReactNode }) {
  const { api, editor, getOption, tf } = useEditorPlugin(PlaceholderPlugin);

  const {
    id,
    element,
    mediaType,
    readOnly,
    selected,
    setIsUploading,
    setProgresses,
    setUpdatedFiles,
    size,
  } = usePlaceholderPopoverState();
  const [open, setOpen] = useState(false);

  const currentMedia = MEDIA_CONFIG[mediaType];

  const multiple = getOption("multiple") ?? true;

  const { isUploading, progress, uploadedFile, uploadFile, uploadingFile } = useUploadFile();

  const pickAsset = usePickAsset();

  const replaceCurrentPlaceholder = useCallback(
    (file: File) => {
      setUpdatedFiles([file]);
      void uploadFile(file);
      api.placeholder.addUploadingFile(element.id as string, file);
    },
    [element.id, setUpdatedFiles, uploadFile, api.placeholder],
  );

  /** Open file picker */
  const { openFilePicker } = useFilePicker({
    readFilesContent: false,
    accept: currentMedia.accept,
    multiple,
    onFilesSelected: ({ plainFiles: updatedFiles }) => {
      if (!updatedFiles) return;

      const firstFile = updatedFiles[0];
      const restFiles = updatedFiles.slice(1);

      replaceCurrentPlaceholder(firstFile);

      if (restFiles.length > 0) {
        tf.insert.media(restFiles as unknown as FileList);
      }
    },
  });

  // React dev mode will call useEffect twice
  const isReplaced = useRef(false);
  /** Paste and drop */
  useEffect(() => {
    if (isReplaced.current) return;

    isReplaced.current = true;
    const currentFiles = api.placeholder.getUploadingFile(element.id as string);

    if (!currentFiles) return;

    replaceCurrentPlaceholder(currentFiles);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReplaced]);

  /** Turn this placeholder into a real media node. One path for both sources:
   *  a fresh upload and an asset picked out of the host's library. */
  const commitMedia = useCallback(
    (file: UploadedFile) => {
      const path = editor.api.findPath(element);

      setMediaNode(
        editor,
        mediaNodeProps(file, mediaType!, {
          placeholderId: element.id as string,
          size,
        }),
        { at: path },
      );
    },
    [editor, element, mediaType, size],
  );

  useEffect(() => {
    if (!uploadedFile) return;

    commitMedia(uploadedFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedFile, element.id, size]);

  /** Library tab: hand off to the host's picker, then commit what it returns. */
  const [isPicking, setIsPicking] = useState(false);

  const onBrowseLibrary = useCallback(async () => {
    if (!pickAsset) return;

    // The host's picker owns the screen while it's open — get out of its way.
    setOpen(false);
    setIsPicking(true);

    try {
      const picked = await pickAsset({ kind: currentMedia.pickKind });

      if (picked) commitMedia(picked);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsPicking(false);
    }
  }, [pickAsset, currentMedia.pickKind, commitMedia]);

  const [embedValue, setEmbedValue] = useState("");

  const onEmbed = useCallback(
    (value: string) => {
      setMediaNode(editor, {
        type: mediaType,
        url: value,
      });
    },
    [editor, mediaType],
  );

  useEffect(() => {
    setOpen(selected);
  }, [selected, setOpen]);

  useEffect(() => {
    if (isUploading) {
      setOpen(false);
    }
  }, [isUploading]);

  useEffect(() => {
    setProgresses({ [uploadingFile?.name ?? ""]: progress });
    setIsUploading(isUploading);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, progress, isUploading, uploadingFile]);

  if (readOnly) return <>{children}</>;

  return (
    <Popover modal={false} onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>

      <PopoverContent
        className="flex flex-col"
        onOpenAutoFocus={(e) => e.preventDefault()}
        variant="media"
      >
        <Tabs className="w-full shrink-0" defaultValue={pickAsset ? "library" : "upload"}>
          <TabsList className="px-2" onMouseDown={(e) => e.preventDefault()}>
            {pickAsset && <TabsTrigger value="library">Library</TabsTrigger>}
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="embed">Embed link</TabsTrigger>
          </TabsList>

          {pickAsset && (
            <TabsContent className="w-[300px] px-3 py-2" value="library">
              <Button
                className="w-full"
                disabled={isPicking}
                onClick={onBrowseLibrary}
                variant="brand"
              >
                {currentMedia.browseText}
              </Button>
              <div className="mt-3 text-muted-foreground text-xs">
                Reuse a file you have already uploaded
              </div>
            </TabsContent>
          )}

          <TabsContent className="w-[300px] px-3 py-2" value="upload">
            <Button className="w-full" onClick={openFilePicker} variant="brand">
              {currentMedia.buttonText}
            </Button>
            <div className="mt-3 text-muted-foreground text-xs">
              The maximum size per file is 5MB
            </div>
          </TabsContent>

          <TabsContent className="w-[300px] px-3 pt-2 pb-3 text-center" value="embed">
            <Input
              onChange={(e) => setEmbedValue(e.target.value)}
              placeholder="Paste the link..."
              value={embedValue}
            />

            <Button
              className="mt-2 w-full max-w-[300px]"
              onClick={() => onEmbed(embedValue)}
              variant="brand"
            >
              {currentMedia.embedText}
            </Button>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

function ImageProgress({
  className,
  file,
  imageRef,
  progress = 0,
}: {
  file: File;
  className?: string;
  imageRef?: RefObject<HTMLImageElement | null>;
  progress?: number;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  // Create and manage Object URL lifecycle - valid Effect (external resource with cleanup)
  useEffect(() => {
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- valid: syncing external resource (Object URL)
    setObjectUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  if (!objectUrl) {
    return null;
  }

  return (
    <div className={cn("relative", className)} contentEditable={false}>
      <img
        alt={file.name}
        className="h-auto w-full rounded-xs object-cover"
        ref={imageRef}
        src={objectUrl}
      />
      {progress < 100 && (
        <div className="absolute right-1 bottom-1 flex items-center space-x-2 rounded-full bg-black/50 px-1 py-0.5">
          <Spinner />
          <span className="font-medium text-white text-xs">{Math.round(progress)}%</span>
        </div>
      )}
    </div>
  );
}

function formatBytes(
  bytes: number,
  opts: {
    decimals?: number;
    sizeType?: "accurate" | "normal";
  } = {},
) {
  const { decimals = 0, sizeType = "normal" } = opts;

  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const accurateSizes = ["Bytes", "KiB", "MiB", "GiB", "TiB"];

  if (bytes === 0) return "0 Byte";

  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return `${(bytes / 1024 ** i).toFixed(decimals)} ${
    sizeType === "accurate" ? (accurateSizes[i] ?? "Bytest") : (sizes[i] ?? "Bytes")
  }`;
}
