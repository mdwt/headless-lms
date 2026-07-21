'use client';

// Host-provided uploads. The app embedding the editor supplies an
// `UploadHandler` wired to its own media API (for the LMS admin:
// POST /api/uploads → presigned PUT to storage → POST /api/assets/:id/confirm).
// Media components consume it through `useUploadFile`. Without a handler the file is
// kept as a local object URL so the editor still works in demos — but nothing
// is persisted.

import React from 'react';
import { toast } from 'sonner';

export interface UploadedFile {
  /** Host-side asset id (empty for local object-URL fallbacks). */
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
}

export type UploadHandler = (
  file: File,
  opts: { onProgress: (fraction: number) => void },
) => Promise<UploadedFile>;

const UploadContext = React.createContext<UploadHandler | null>(null);

export function UploadProvider({
  children,
  uploadFile,
}: {
  children: React.ReactNode;
  uploadFile: UploadHandler | null;
}) {
  return (
    <UploadContext.Provider value={uploadFile}>{children}</UploadContext.Provider>
  );
}

interface UseUploadFileProps {
  onUploadComplete?: (file: UploadedFile) => void;
  onUploadError?: (error: unknown) => void;
}

export function useUploadFile({
  onUploadComplete,
  onUploadError,
}: UseUploadFileProps = {}) {
  const handler = React.useContext(UploadContext);
  const [uploadedFile, setUploadedFile] = React.useState<UploadedFile>();
  const [uploadingFile, setUploadingFile] = React.useState<File>();
  const [progress, setProgress] = React.useState<number>(0);
  const [isUploading, setIsUploading] = React.useState(false);

  async function uploadFile(file: File) {
    setIsUploading(true);
    setUploadingFile(file);

    try {
      let result: UploadedFile;

      if (handler) {
        result = await handler(file, {
          onProgress: (fraction) =>
            setProgress(Math.min(Math.round(fraction * 100), 100)),
        });
      } else {
        // No host uploader configured — keep the file locally so the editor
        // stays usable, but warn: the media won't survive a reload.
        toast.warning('Uploads are not configured; this file is not persisted.');
        result = {
          id: '',
          name: file.name,
          size: file.size,
          type: file.type,
          url: URL.createObjectURL(file),
        };
        setProgress(100);
      }

      setUploadedFile(result);
      onUploadComplete?.(result);

      return result;
    } catch (error) {
      toast.error(getErrorMessage(error));
      onUploadError?.(error);
      return undefined;
    } finally {
      setProgress(0);
      setIsUploading(false);
      setUploadingFile(undefined);
    }
  }

  return {
    isUploading,
    progress,
    uploadedFile,
    uploadFile,
    uploadingFile,
  };
}

export function getErrorMessage(err: unknown) {
  if (err instanceof Error && err.message.length > 0) return err.message;

  return 'Something went wrong, please try again later.';
}
