import Link from "next/link";
import { Download as DownloadIcon, Inbox } from "lucide-react";

import { requireAuth } from "@/lib/auth/server-session";
import { learnApi } from "@/lib/api/server";
import type { Download } from "@/lib/api/types";

async function thumbnailsFor(downloads: Download[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  await Promise.all(
    downloads.map(async (d) => {
      if (!d.thumbnailAssetId) return;
      const url = await learnApi.assetUrl(d.thumbnailAssetId);
      if (url) urls.set(d.id, url);
    }),
  );
  return urls;
}

export default async function DownloadsPage() {
  const downloadsPromise = learnApi.listDownloads();
  await requireAuth(downloadsPromise);
  const downloads = await downloadsPromise;
  // File counts come from each download's own assets resource; the learn list
  // row is the bare download record.
  const [thumbnails, details] = await Promise.all([
    thumbnailsFor(downloads),
    Promise.all(downloads.map((d) => learnApi.getDownload(d.id))),
  ]);
  const fileCounts = new Map(downloads.map((d, i) => [d.id, details[i]?.assets.length ?? 0]));

  return (
    <div className="mx-auto max-w-[1180px] px-7 pb-[70px] pt-[30px]">
      <h1 className="mb-6 text-[28px] font-semibold tracking-[-0.01em]">Downloads</h1>

      {downloads.length === 0 ? (
        <div className="mx-auto max-w-[560px] px-7 py-[90px] text-center">
          <div className="mx-auto mb-6 grid size-16 place-items-center rounded-[18px] border border-line bg-surface text-ink-faintest">
            <Inbox className="size-7" strokeWidth={1.5} />
          </div>
          <h2 className="mb-3 text-[21px] font-semibold tracking-[-0.01em]">No downloads yet</h2>
          <p className="text-[14.5px] leading-[1.6] text-ink-2">
            You aren&apos;t entitled to any downloads right now.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-[18px] min-[900px]:grid-cols-2 min-[1080px]:grid-cols-3">
          {downloads.map((download) => (
            <Link
              key={download.id}
              href={`/downloads/${download.id}`}
              className="flex flex-col overflow-hidden rounded-card border border-line bg-surface transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-[3px] hover:border-line-hover hover:shadow-[0_12px_30px_-18px_rgba(20,20,18,0.28)] dark:hover:shadow-none"
            >
              {thumbnails.has(download.id) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbnails.get(download.id)}
                  alt=""
                  className="h-[150px] w-full object-cover"
                />
              ) : (
                <div className="grid h-[150px] w-full place-items-center bg-surface-warm-2 text-ink-faintest">
                  <DownloadIcon className="size-8" strokeWidth={1.5} />
                </div>
              )}
              <div className="flex flex-1 flex-col px-[17px] pt-4 pb-[18px]">
                <div className="mb-1 text-[13px] text-ink-3">{download.category}</div>
                <h3 className="mb-1.5 text-[18.5px] font-semibold leading-[1.2] tracking-[-0.005em]">
                  {download.title}
                </h3>
                <p className="mb-4 line-clamp-2 text-[13.5px] leading-[1.5] text-ink-2">
                  {download.description}
                </p>
                <div className="mt-auto text-[12.5px] text-ink-3">
                  {fileCounts.get(download.id)}{" "}
                  {fileCounts.get(download.id) === 1 ? "file" : "files"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
