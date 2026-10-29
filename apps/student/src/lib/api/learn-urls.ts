const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function activityAssetUrl(activityId: string, assetId: string): string {
  return `${API_URL}/api/learn/activities/${encodeURIComponent(activityId)}/assets/${encodeURIComponent(assetId)}`;
}

export function downloadThumbnailUrl(downloadId: string): string {
  return `${API_URL}/api/learn/downloads/${encodeURIComponent(downloadId)}/thumbnail`;
}
