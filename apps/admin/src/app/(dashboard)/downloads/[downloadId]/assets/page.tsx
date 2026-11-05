import { serverApi } from "@/lib/api/server";
import { requirePermission } from "@/lib/auth/server-permissions";

import { DownloadAssetsPanel } from "../_components/download-assets-panel";

// Files tab: the ordered asset list for the download. Segment is `assets`
// (matches the table/API); the visible tab label is "Files".
export default async function DownloadAssetsTab({
  params,
}: {
  params: Promise<{ downloadId: string }>;
}) {
  const { downloadId } = await params;
  const { permissions } = await requirePermission("downloads:read", downloadId);

  const assets = await serverApi.listDownloadAssets(downloadId);

  return (
    <DownloadAssetsPanel
      downloadId={downloadId}
      assets={assets}
      canEdit={permissions.has("downloads:write", downloadId)}
    />
  );
}
