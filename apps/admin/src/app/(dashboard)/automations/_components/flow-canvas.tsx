"use client";

import * as React from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { AutomationTriggerInfo, AvailableAction } from "@/lib/api/types";
import type { AutomationDraft, EditorSelection } from "./draft";
import {
  ActionNode,
  AddNode,
  InsertEdge,
  NODE_WIDTH,
  TriggerNode,
  type EditorNode,
} from "./flow-nodes";

const nodeTypes = { trigger: TriggerNode, action: ActionNode, add: AddNode };
const edgeTypes = { insert: InsertEdge };

const GAP_Y = 148;
const EDGE_STYLE: React.CSSProperties = { stroke: "var(--line-strong)", strokeWidth: 1.5 };
const FIT_VIEW = { padding: 0.25, maxZoom: 1 };

interface FlowCanvasProps {
  draft: AutomationDraft;
  triggerInfo: AutomationTriggerInfo | undefined;
  defs: Map<string, AvailableAction>;
  selection: EditorSelection;
  incomplete: ReadonlySet<number>;
  attempted: boolean;
  onSelect: (selection: EditorSelection) => void;
  /** Insert a blank step at `index` (append = actions.length). */
  onAddStep: (index: number) => void;
}

function FlowCanvasInner({
  draft,
  triggerInfo,
  defs,
  selection,
  incomplete,
  attempted,
  onSelect,
  onAddStep,
}: FlowCanvasProps) {
  const { fitView } = useReactFlow();

  const nodes = React.useMemo<EditorNode[]>(() => {
    const actionNodes = draft.actions.map((action, i): EditorNode => {
      const def = defs.get(action.type);
      return {
        id: `action-${i}`,
        type: "action",
        position: { x: 0, y: GAP_Y * (i + 1) },
        width: NODE_WIDTH,
        data: {
          actionType: action.type,
          description: def?.description ?? null,
          index: i,
          isSelected: selection?.kind === "action" && selection.index === i,
          incomplete: incomplete.has(i),
          isSystem: def ? def.source === "system" : true,
        },
      };
    });
    return [
      {
        id: "trigger",
        type: "trigger",
        position: { x: 0, y: 0 },
        width: NODE_WIDTH,
        data: {
          triggerType: draft.trigger,
          description: triggerInfo?.description ?? null,
          isSelected: selection?.kind === "trigger",
          invalid: attempted && !draft.trigger,
        },
      },
      ...actionNodes,
      {
        id: "add",
        type: "add",
        position: { x: 0, y: GAP_Y * (draft.actions.length + 1) },
        width: NODE_WIDTH,
        data: {},
      },
    ];
  }, [draft.trigger, draft.actions, triggerInfo, defs, selection, incomplete, attempted]);

  const edges = React.useMemo<Edge[]>(() => {
    const chain = ["trigger", ...draft.actions.map((_, i) => `action-${i}`), "add"];
    return chain.slice(0, -1).map((source, i) => {
      const target = chain[i + 1];
      if (target === "add") {
        return { id: `e-${source}-add`, source, target, type: "straight", style: EDGE_STYLE };
      }
      // The "+" on an edge inserts at its target step's position.
      return {
        id: `e-${source}-${target}`,
        source,
        target,
        type: "insert",
        style: EDGE_STYLE,
        data: { onInsert: () => onAddStep(i) },
      };
    });
  }, [draft.actions, onAddStep]);

  // Re-frame the chain when its length changes (next frame, so new nodes are measured).
  const stepCount = draft.actions.length;
  React.useEffect(() => {
    const id = requestAnimationFrame(() => void fitView({ ...FIT_VIEW, duration: 200 }));
    return () => cancelAnimationFrame(id);
  }, [stepCount, fitView]);

  const handleNodeClick = React.useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      if (node.id === "add") onAddStep(stepCount);
      else if (node.id === "trigger") onSelect({ kind: "trigger" });
      else if (node.id.startsWith("action-")) {
        onSelect({ kind: "action", index: Number(node.id.slice("action-".length)) });
      }
    },
    [onAddStep, onSelect, stepCount],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={handleNodeClick}
      onPaneClick={() => onSelect(null)}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      edgesFocusable={false}
      zoomOnDoubleClick={false}
      deleteKeyCode={null}
      minZoom={0.4}
      maxZoom={1.25}
      fitView
      fitViewOptions={FIT_VIEW}
      className="[&_.react-flow__attribution]:text-[10px] [&_.react-flow__attribution]:text-ink-4"
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1.4} color="var(--line)" />
      <Controls
        position="bottom-left"
        showInteractive={false}
        className="overflow-hidden !rounded-lg !border !border-line !shadow-sm [&>button]:!border-b-line [&>button]:!bg-surface [&>button]:!text-ink-3 [&>button:hover]:!bg-hover [&>button:hover]:!text-ink"
      />
    </ReactFlow>
  );
}

/** The automation chain as a flow diagram: trigger → steps → add, with insert points on edges. */
export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
