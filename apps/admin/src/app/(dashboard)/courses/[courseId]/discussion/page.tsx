// Comments tab: the course's comments, filtered. The API scopes by course, so
// this tab is the whole moderation surface — there is no global inbox. Comment
// settings live on the Settings tab.
//
// Everything here renders on the server except three leaves: row selection,
// the per-row action strip, and the bulk bar.
import { serverApi } from "@/lib/api/server";
import { requirePermission } from "@/lib/auth/server-permissions";
import type { ListParams } from "@/lib/api/types";
import { parseListParams } from "@/lib/table/parse-list-params";

import { basePath, nest, type RawSearchParams } from "./_lib/list-url";
import { CommentStats } from "./_components/comment-stats";
import { CommentFilters } from "./_components/comment-filters";
import { CommentSearch } from "./_components/comment-search";
import { CommentEmpty, CommentPager } from "./_components/comment-pager";
import { CommentBody } from "./_components/comment-body";
import { ModerationRow } from "./_components/moderation-row";
import { RowActions } from "./_components/row-actions";
import { SelectionBar, SelectionProvider } from "./_components/selection";
import { fullName } from "@/lib/format";

/** The queue's headline numbers. The list endpoint is the only count there is,
 *  so each one is a one-row page read for its `total` — cheap, and it keeps the
 *  tallies honest against whatever the filters are actually matching. */
function countParams(base: ListParams, filters: Record<string, string[]>): ListParams {
  return { ...base, page: 1, pageSize: 1, filters };
}

export default async function CourseCommentsTab({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { courseId } = await params;
  await requirePermission("courses:moderate", courseId);
  const search = await searchParams;
  const listParams = parseListParams(search, {
    pageSize: 20,
    initialSort: [{ id: "createdAt", desc: true }],
  });

  const [page, all, pending, published, removed, reported] = await Promise.all([
    serverApi.listComments(courseId, listParams),
    serverApi.listComments(courseId, countParams(listParams, {})),
    serverApi.listComments(courseId, countParams(listParams, { status: ["pending"] })),
    serverApi.listComments(courseId, countParams(listParams, { status: ["published"] })),
    serverApi.listComments(courseId, countParams(listParams, { status: ["removed"] })),
    serverApi.listComments(courseId, countParams(listParams, { reported: ["true"] })),
  ]);

  const path = basePath(courseId);
  const nodes = nest(page.rows);
  const selectableIds = nodes.map((n) => n.comment.id);
  const lastPage = Math.max(1, Math.ceil(page.total / listParams.pageSize));
  const counts = {
    all: all.total,
    pending: pending.total,
    published: published.total,
    removed: removed.total,
    reported: reported.total,
  };

  return (
    <section className="flex flex-col gap-5">
      <CommentStats counts={counts} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <CommentFilters
          path={path}
          search={search}
          status={listParams.filters?.status?.[0] ?? ""}
          reported={listParams.filters?.reported?.[0] ?? ""}
          counts={counts}
        />
        <div className="flex flex-wrap items-center gap-2">
          <CommentSearch path={path} search={search} value={listParams.search ?? ""} />
        </div>
      </div>

      <SelectionProvider>
        {page.rows.length > 0 && <SelectionBar ids={selectableIds} />}

        {page.rows.length === 0 ? (
          <CommentEmpty />
        ) : (
          <div className="flex flex-col gap-3">
            {nodes.map(({ comment, replies }) => (
              <ModerationRow
                key={comment.id}
                id={comment.id}
                authorName={fullName(comment.author)}
                authorImage={comment.author.image}
                flagged={comment.reports.length > 0}
                removed={comment.status === "removed"}
                actions={
                  <RowActions
                    id={comment.id}
                    status={comment.status}
                    flagged={comment.reports.length > 0}
                  />
                }
              >
                <CommentBody comment={comment} replies={replies} />
              </ModerationRow>
            ))}
          </div>
        )}
      </SelectionProvider>

      {page.total > listParams.pageSize && (
        <CommentPager
          path={path}
          search={search}
          page={listParams.page}
          lastPage={lastPage}
          total={page.total}
        />
      )}
    </section>
  );
}
