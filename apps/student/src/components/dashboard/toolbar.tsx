"use client";

import { LayoutGrid, List } from "lucide-react";
import { SegmentedControl } from "@/components/primitives/segmented-control";

export type FilterValue = "all" | "inprogress" | "completed";
export type SortValue = "recent" | "progress" | "title";
export type LayoutValue = "grid" | "list";

/** Dashboard toolbar (handoff §4): filter segmented · sort · grid/list toggle. */
export function Toolbar({
  filter,
  onFilter,
  sort,
  onSort,
  layout,
  onLayout,
}: {
  filter: FilterValue;
  onFilter: (v: FilterValue) => void;
  sort: SortValue;
  onSort: (v: SortValue) => void;
  layout: LayoutValue;
  onLayout: (v: LayoutValue) => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <SegmentedControl
        value={filter}
        onChange={onFilter}
        options={[
          { value: "all", label: "All" },
          { value: "inprogress", label: "In progress" },
          { value: "completed", label: "Completed" },
        ]}
      />
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-[7px] text-[13px] text-ink-3">
          <span>Sort</span>
          <select
            value={sort}
            onChange={(e) => onSort(e.target.value as SortValue)}
            className="cursor-pointer rounded-[9px] border border-line bg-surface px-3 py-[7px] text-[13px] text-[#4a4843]"
          >
            <option value="recent">Recently accessed</option>
            <option value="progress">Progress</option>
            <option value="title">Title (A–Z)</option>
          </select>
        </div>
        <SegmentedControl
          size="icon"
          value={layout}
          onChange={onLayout}
          options={[
            { value: "grid", title: "Grid", icon: <LayoutGrid className="size-[17px]" strokeWidth={1.7} /> },
            { value: "list", title: "List", icon: <List className="size-[17px]" strokeWidth={1.7} /> },
          ]}
        />
      </div>
    </div>
  );
}
