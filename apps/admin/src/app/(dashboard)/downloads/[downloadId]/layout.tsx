import type { ReactNode } from "react";
import { requirePermission } from "@/lib/auth/server-permissions";
import { serverApi } from "@/lib/api/server";

import { DownloadHeader } from "./_components/download-header";

// Shared shell for a single download: back link, header, and the tab nav. Each
// tab is its own route segment (assets / details / access) rendered as
// `children`. Gated on `downloads:read` on the download.
export default async function DownloadLayout({
  params,
  children,
}: {
  params: Promise<{ downloadId: string }>;
  children: ReactNode;
}) {
  const { downloadId } = await params;

  const { permissions } = await requirePermission("downloads:read", downloadId);
  const [download, stats] = await Promise.all([
    serverApi.getDownload(downloadId),
    serverApi.downloadStats(downloadId, permissions.has("access:read")),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <DownloadHeader download={download} stats={stats} />
      {children}
    </div>
  );
}
