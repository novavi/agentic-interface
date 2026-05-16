"use client";

import { useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import Dagre from "@dagrejs/dagre";
import { getAgentGraphUrl, getAgentStreamUrl } from "@/config/backend-config";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 40;

interface LangGraphEdge {
  source: string;
  target: string;
  conditional?: boolean;
  data?: unknown;
}

interface GraphResponse {
  nodes: Array<{ id: string; data?: unknown }>;
  edges: LangGraphEdge[];
}

type StreamEventRecord = Record<string, unknown>;
type ConnectionState = "open" | "closed" | "error";

function formatNodeLabel(id: string): string {
  if (id === "__start__") return "Start";
  if (id === "__end__" || id === "__END__") return "End";
  return id
    .replace(/_node$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 50 });
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  Dagre.layout(g);
  return nodes.map((n) => {
    const { x, y } = g.node(n.id);
    return { ...n, position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 } };
  });
}

function toReactFlow(graph: GraphResponse): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = graph.nodes.map((n) => ({
    id: n.id,
    type:
      n.id === "__start__"
        ? "input"
        : n.id === "__end__" || n.id === "__END__"
          ? "output"
          : "default",
    data: { label: formatNodeLabel(n.id) },
    position: { x: 0, y: 0 },
  }));

  const edges: Edge[] = graph.edges.map((e, i) => {
    const edgeData = e.data as { conditional?: boolean; label?: string } | string | undefined;
    const isConditional =
      e.conditional ??
      (typeof edgeData === "object" && edgeData !== null ? edgeData.conditional : undefined) ??
      false;
    const label =
      typeof edgeData === "string"
        ? edgeData
        : typeof edgeData === "object" && edgeData !== null
          ? edgeData.label
          : undefined;

    return {
      id: `e-${i}-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      label,
      style: isConditional ? { strokeDasharray: "5 5" } : undefined,
      markerEnd: { type: MarkerType.ArrowClosed },
    };
  });

  return { nodes: applyDagreLayout(nodes, edges), edges };
}

interface WorkflowVisualizerProps {
  graphId: string;
  currentThreadId: string | null;
  isRunning: boolean;
}

export function WorkflowVisualizer({ graphId, currentThreadId }: WorkflowVisualizerProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [streamEvents, setStreamEvents] = useState<StreamEventRecord[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  // Fetch the static graph definition (nodes + edges) when no run is active.
  useEffect(() => {
    if (currentThreadId !== null) return;
    setLoading(true);
    setError(null);
    fetch(getAgentGraphUrl(graphId))
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load graph (HTTP ${res.status})`);
        return res.json() as Promise<GraphResponse>;
      })
      .then((data) => {
        const { nodes: n, edges: e } = toReactFlow(data);
        setNodes(n);
        setEdges(e);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [graphId, currentThreadId, setNodes, setEdges]);

  // Open an SSE connection to the stream proxy route while a run is active; close and clean up on unmount or threadId change.
  useEffect(() => {
    if (currentThreadId === null) {
      setStreamEvents([]);
      setConnectionState(null);
      return;
    }

    setStreamEvents([]);
    setConnectionState("open");

    const es = new EventSource(getAgentStreamUrl(graphId, currentThreadId));

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as StreamEventRecord;
        if (event.event === "stream_end") {
          es.close();
          setConnectionState("closed");
          return;
        }
        setStreamEvents((prev) => [...prev, event]);
      } catch {
        // ignore malformed SSE payloads
      }
    };

    es.onerror = () => {
      es.close();
      setConnectionState((prev) => (prev === "closed" ? "closed" : "error"));
    };

    return () => {
      es.close();
    };
  }, [graphId, currentThreadId]);

  // Keep the event log scrolled to the bottom as new events arrive.
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamEvents]);

  // --- Streaming mode: display live run events as raw JSON ---
  if (currentThreadId !== null) {
    const badge =
      connectionState === "open"
        ? { text: "● Live", cls: "text-green-400" }
        : connectionState === "closed"
          ? { text: "✓ Complete", cls: "text-gray-400" }
          : { text: "✗ Error", cls: "text-red-400" };

    return (
      <div className="flex flex-col h-full overflow-hidden rounded-md border border-gray-800">
        <div className="flex-none px-3 py-1.5 border-b border-gray-800 bg-gray-900">
          <span className={`font-mono text-xs ${badge.cls}`}>{badge.text}</span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto bg-gray-950">
          <pre className="p-3 font-mono text-xs text-gray-300 whitespace-pre-wrap break-words">
            {streamEvents.length === 0
              ? "Waiting for stream…"
              : streamEvents.map((ev) => JSON.stringify(ev, null, 2)).join("\n\n")}
          </pre>
          <div ref={eventsEndRef} />
        </div>
      </div>
    );
  }

  // --- Graph definition mode: render the static workflow diagram ---
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        Loading graph…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        colorMode="dark"
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
