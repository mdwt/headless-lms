import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download as DownloadIcon } from "lucide-react";

import { requireAuth } from "@/lib/auth/server-session";
import { memberApi } from "@/lib/api/server";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function DownloadDetailPage({
  params,
}: {
  params: Promise<{ downloadId: string }>;
}) {
  const { downloadId } = await params;
  const detailPromise = memberApi.getDownload(downloadId);
  await requireAuth(detailPromise);
  const detail = await detailPromise;
  if (!detail) notFound();

  const { download, assets } = detail;
  const thumbnailUrl = download.thumbnailUrl;

  return (
    <div className="mx-auto max-w-[860px] px-7 pb-[70px] pt-[30px]">
      <Link
        href="/downloads"
        className="mb-6 inline-flex items-center gap-1.5 text-[13.5px] text-ink-2 hover:text-ink"
      >
        <ArrowLeft className="size-4" strokeWidth={1.7} />
        All downloads
      </Link>

      <div className="mb-8 flex items-start gap-5">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt="" className="size-[88px] shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="grid size-[88px] shrink-0 place-items-center rounded-lg bg-surface-warm-2 text-ink-faintest">
            <DownloadIcon className="size-7" strokeWidth={1.5} />
          </div>
        )}
        <div>
          <div className="mb-1 text-[13px] text-ink-3">{download.category}</div>
          <h1 className="mb-2 text-[26px] font-semibold tracking-[-0.01em]">{download.title}</h1>
          <p className="text-[14.5px] leading-[1.6] text-ink-2">{download.description}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-surface">
        {assets.map((asset, i) => (
          <div
            key={asset.id}
            className={cn(
              "flex items-center justify-between gap-4 px-5 py-4",
              i > 0 && "border-t border-line-divider",
            )}
          >
            <div className="min-w-0">
              <div className="truncate text-[14.5px] font-medium">
                {asset.displayName ?? `File ${i + 1}`}
              </div>
            </div>
            <Button asChild variant="brand" size="pillSm" className="shrink-0">
              <a href={asset.url} download>
                Download
              </a>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
