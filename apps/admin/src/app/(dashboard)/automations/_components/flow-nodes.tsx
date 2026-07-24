"use client";

import * as React from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  getStraightPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Blocks, Mail, Plus, Zap } from "lucide-react";

import { cn } from "@/lib/utils";

export const NODE_WIDTH = 300;

export type TriggerNodeData = {
  triggerType: string;
  description: string | null;
  isSelected: boolean;
  invalid: boolean;
};
export type TriggerFlowNode = Node<TriggerNodeData, "trigger">;

export type ActionNodeData = {
  actionType: string;
  description: string | null;
  index: number;
  isSelected: boolean;
  incomplete: boolean;
  isSystem: boolean;
};
export type ActionFlowNode = Node<ActionNodeData, "action">;

export type AddFlowNode = Node<Record<string, unknown>, "add">;

export type InsertEdgeData = { onInsert: () => void };
export type InsertFlowEdge = Edge<InsertEdgeData, "insert">;

export type EditorNode = TriggerFlowNode | ActionFlowNode | AddFlowNode;

const hiddenHandle: React.CSSProperties = {
  opacity: 0,
  pointerEvents: "none",
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  border: 0,
};

function cardClasses(isSelected: boolean, dashed = false): string {
  return cn(
    "w-[300px] cursor-pointer rounded-xl border bg-surface p-3.5 text-left shadow-[0_1px_2px_rgb(24_24_27/0.06)] transition-[border-color,box-shadow]",
    isSelected
      ? "border-ink shadow-[0_0_0_3px_var(--brand-soft-2)]"
      : "border-line hover:border-line-strong",
    dashed && !isSelected && "border-dashed",
  );
}

export function TriggerNode({ data }: NodeProps<TriggerFlowNode>) {
  return (
    <div className={cn(cardClasses(data.isSelected, !data.triggerType), data.invalid && "border-danger")}>
      <div className="flex items-center gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-ink text-white">
          <Zap className="size-3.5" />
        </span>
        <div className="min-w-0">
          <div className="text-[11px] font-medium tracking-wide text-ink-4 uppercase">When</div>
          <div className={cn("truncate text-sm font-medium", data.triggerType ? "text-ink" : "text-ink-4")}>
            {data.triggerType || "Choose a trigger"}
          </div>
        </div>
      </div>
      {data.description ? (
        <p className="mt-2 line-clamp-2 text-xs text-ink-3">Runs when {data.description}.</p>
      ) : null}
      <Handle type="source" position={Position.Bottom} style={hiddenHandle} />
    </div>
  );
}

export function ActionNode({ data }: NodeProps<ActionFlowNode>) {
  return (
    <div className={cardClasses(data.isSelected, !data.actionType)}>
      <div className="flex items-center gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-ink-2">
          {data.isSystem ? <Mail className="size-3.5" /> : <Blocks className="size-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium tracking-wide text-ink-4 uppercase">
            Step {data.index + 1}
          </div>
          <div className={cn("truncate text-sm font-medium", data.actionType ? "text-ink" : "text-ink-4")}>
            {data.actionType || "Choose an action"}
          </div>
        </div>
        {data.incomplete ? (
          <span title="Needs setup" className="size-2 shrink-0 rounded-full bg-warning" />
        ) : null}
      </div>
      {data.description ? (
        <p className="mt-2 line-clamp-2 text-xs text-ink-3">{data.description}</p>
      ) : null}
      <Handle type="target" position={Position.Top} style={hiddenHandle} />
      <Handle type="source" position={Position.Bottom} style={hiddenHandle} />
    </div>
  );
}

export function AddNode() {
  return (
    <div className="grid w-[300px] cursor-pointer place-items-center rounded-xl border border-dashed border-line-strong px-3 py-3 text-sm font-medium text-ink-3 transition-colors hover:border-ink-3 hover:text-ink">
      <span className="inline-flex items-center gap-1.5">
        <Plus className="size-4" /> Add step
      </span>
      <Handle type="target" position={Position.Top} style={hiddenHandle} />
    </div>
  );
}

/** Straight edge with a centered "+" button that inserts a step at its target's position. */
export function InsertEdge({ sourceX, sourceY, targetX, targetY, style, data }: EdgeProps<InsertFlowEdge>) {
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  return (
    <>
      <BaseEdge path={path} style={style} />
      <EdgeLabelRenderer>
        <button
          type="button"
          onClick={data?.onInsert}
          aria-label="Insert step here"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          className="nodrag nopan pointer-events-auto absolute grid size-5 place-items-center rounded-full border border-line bg-surface text-ink-4 shadow-sm transition-colors hover:border-ink-2 hover:text-ink"
        >
          <Plus className="size-3" />
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
