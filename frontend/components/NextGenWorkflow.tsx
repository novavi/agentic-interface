"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAgent, useCopilotKit } from "@copilotkit/react-core/v2";
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
import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AGENT_CONFIG, getAgentGraphUrl } from "@/config/backend-config";
import { mapStatusLabel } from "@/lib/workflow-status";

const WORKFLOWS_KEY = "agentic-interface-workflows";
const NODE_WIDTH = 180;
const NODE_HEIGHT = 40;

interface WorkflowEntry {
  threadId: string;
  graphId: string;
  workflowRunName: string;
  status: "running" | "complete" | "error";
  startedAt: string;
  completedAt?: string;
}

interface RunMeta {
  name: string;
  startedAt: string;
  completedAt?: string;
}

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

const workflowAgents = AGENT_CONFIG.filter((a) => a.isWorkflowGraph);

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

function formatLocalTime(iso: string): string {
  const d = new Date(iso);
  return (
    String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0") + ":" +
    String(d.getSeconds()).padStart(2, "0") + "." +
    String(d.getMilliseconds()).padStart(3, "0")
  );
}

function StatusField({ label, value, tooltip, width = "w-32" }: {
  label: string;
  value?: string;
  tooltip?: string;
  width?: string;
}) {
  return (
    <div className={`relative flex flex-col gap-1${tooltip ? " group cursor-help" : ""}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </span>
      <div
        className={`${width} h-8 px-2.5 flex items-center rounded border border-gray-700 bg-gray-800/50 text-xs text-gray-300 font-mono truncate`}
      >
        {value ?? ""}
      </div>
      {tooltip && (
        <div className="absolute top-full left-0 mt-1 z-50 hidden group-hover:block whitespace-nowrap rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-300 shadow-lg">
          {tooltip}
        </div>
      )}
    </div>
  );
}

interface NextGenWorkflowProps {
  threadId: string | null;
}

export function NextGenWorkflow({ threadId: threadIdProp }: NextGenWorkflowProps) {
  const router = useRouter();
  const [selectedGraphId, setSelectedGraphId] = useState<string>(workflowAgents[0].graphId);
  const { agent } = useAgent({ agentId: selectedGraphId });
  const { copilotkit } = useCopilotKit();
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(threadIdProp);
  const [isWorkflowRunning, setIsWorkflowRunning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [runMeta, setRunMeta] = useState<RunMeta | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [graphLoading, setGraphLoading] = useState(true);
  const [graphError, setGraphError] = useState<string | null>(null);

  // Fetch static graph definition whenever the selected graph changes.
  // The `cancelled` flag discards responses from superseded fetches (e.g. when
  // the graph-restore effect updates selectedGraphId after initial mount).
  useEffect(() => {
    let cancelled = false;
    setGraphLoading(true);
    setGraphError(null);
    fetch(getAgentGraphUrl(selectedGraphId))
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load graph (HTTP ${res.status})`);
        return res.json() as Promise<GraphResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        const { nodes: n, edges: e } = toReactFlow(data);
        setNodes(n);
        setEdges(e);
      })
      .catch((err: Error) => { if (!cancelled) setGraphError(err.message); })
      .finally(() => { if (!cancelled) setGraphLoading(false); });
    return () => { cancelled = true; };
  }, [selectedGraphId, setNodes, setEdges]);

  // Sync currentThreadId with URL (back/forward navigation).
  useEffect(() => {
    setCurrentThreadId(threadIdProp);
  }, [threadIdProp]);

  // Load run metadata from session storage whenever the active thread changes.
  useEffect(() => {
    if (!currentThreadId) { setRunMeta(null); return; }
    try {
      const entries: WorkflowEntry[] = JSON.parse(sessionStorage.getItem(WORKFLOWS_KEY) ?? "[]");
      const entry = entries.find((w) => w.threadId === currentThreadId);
      setRunMeta(entry ? { name: entry.workflowRunName, startedAt: entry.startedAt, completedAt: entry.completedAt } : null);
    } catch { setRunMeta(null); }
  }, [currentThreadId]);

  // Restore graphId from session storage when loading a thread via URL.
  useEffect(() => {
    if (!threadIdProp) return;
    try {
      const entries: WorkflowEntry[] = JSON.parse(sessionStorage.getItem(WORKFLOWS_KEY) ?? "[]");
      const entry = entries.find((w) => w.threadId === threadIdProp);
      if (entry) setSelectedGraphId(entry.graphId);
    } catch {
      // ignore
    }
  }, [threadIdProp]);

  // View mode: connect to an existing thread when navigating via URL.
  // viewConnectedRef tracks the last threadId we connected with for the current agent,
  // preventing redundant connectAgent calls. Reset in cleanup so agent changes re-trigger.
  const viewConnectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!threadIdProp) {
      viewConnectedRef.current = null;
      return;
    }
    if (isWorkflowRunning) return;
    if (viewConnectedRef.current === threadIdProp) return;

    viewConnectedRef.current = threadIdProp;
    agent.threadId = threadIdProp;
    setIsConnecting(true);
    copilotkit
      .connectAgent({ agent })
      .then(() => setIsConnecting(false))
      .catch(() => setIsConnecting(false));

    return () => {
      viewConnectedRef.current = null; // allow reconnect if agent changes (e.g. graphId restore)
      agent.detachActiveRun().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, threadIdProp, isWorkflowRunning]);

  const handleGraphChange = (newGraphId: string) => {
    agent.setState({});
    agent.setMessages([]);
    setSelectedGraphId(newGraphId);
    setCurrentThreadId(null);
    viewConnectedRef.current = null;
    router.push("/workflow-v2");
  };

  const handleStartWorkflow = async () => {
    const newThreadId = crypto.randomUUID();
    const selectedAgentConfig = workflowAgents.find((a) => a.graphId === selectedGraphId)!;

    agent.setState({});
    agent.setMessages([]);
    setCurrentThreadId(null);

    try {
      const entries: WorkflowEntry[] = JSON.parse(sessionStorage.getItem(WORKFLOWS_KEY) ?? "[]");
      const runName = `Workflow Run #${entries.length + 1}`;
      const startedAt = new Date().toISOString();
      entries.push({ threadId: newThreadId, graphId: selectedGraphId, workflowRunName: runName, status: "running", startedAt });
      sessionStorage.setItem(WORKFLOWS_KEY, JSON.stringify(entries));
    } catch {
      // ignore
    }

    setCurrentThreadId(newThreadId);
    setIsWorkflowRunning(true);
    viewConnectedRef.current = newThreadId; // prevent view-mode effect from interfering
    window.history.pushState(null, '', `/workflow-v2/${newThreadId}`);

    agent.threadId = newThreadId;
    agent.setMessages([
      { id: crypto.randomUUID(), role: "user", content: selectedAgentConfig.triggerMessage! },
    ]);

    try {
      await copilotkit.runAgent({ agent });
      try {
        const entries: WorkflowEntry[] = JSON.parse(sessionStorage.getItem(WORKFLOWS_KEY) ?? "[]");
        const idx = entries.findIndex((w) => w.threadId === newThreadId);
        if (idx !== -1 && entries[idx].status === "running") {
          const completedAt = new Date().toISOString();
          entries[idx].status = "complete";
          entries[idx].completedAt = completedAt;
          sessionStorage.setItem(WORKFLOWS_KEY, JSON.stringify(entries));
          setRunMeta((prev) => prev ? { ...prev, completedAt } : prev);
        }
      } catch {
        // ignore
      }
    } catch {
      try {
        const entries: WorkflowEntry[] = JSON.parse(sessionStorage.getItem(WORKFLOWS_KEY) ?? "[]");
        const idx = entries.findIndex((w) => w.threadId === newThreadId);
        if (idx !== -1) {
          const completedAt = new Date().toISOString();
          entries[idx].status = "error";
          entries[idx].completedAt = completedAt;
          sessionStorage.setItem(WORKFLOWS_KEY, JSON.stringify(entries));
          setRunMeta((prev) => prev ? { ...prev, completedAt } : prev);
        }
      } catch {
        // ignore
      }
    } finally {
      setIsWorkflowRunning(false);
    }
  };

  const rawStatus = currentThreadId ? (agent.state?.status as string | undefined) : undefined;
  const assistantMessages = agent.messages.filter((m) => m.role === "assistant");
  const hasState = agent.state && Object.keys(agent.state).length > 0;

  const completedSteps: string[] = currentThreadId ? (agent.state?.completed_steps ?? []) : [];
  const completedNodeIds = new Set<string>(completedSteps.map((s) => `${s}_node`));
  if (completedSteps.length > 0) completedNodeIds.add("__start__");
  if (currentThreadId && rawStatus === "complete") completedNodeIds.add("__end__");

  const completedNodeStyle = { border: "2px solid #10b981", backgroundColor: "rgba(16, 185, 129, 0.12)" };
  const styledNodes = nodes.map((n) =>
    completedNodeIds.has(n.id) ? { ...n, style: completedNodeStyle } : n
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-none flex items-end gap-3 px-6 pt-6 pb-[18px]">
        <div className="flex flex-col gap-1 -ml-[3px]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Workflow
          </span>
          <div className="relative">
            <select
              value={selectedGraphId}
              onChange={(e) => handleGraphChange(e.target.value)}
              disabled={isWorkflowRunning}
              className="h-8 w-auto appearance-none rounded-md border border-gray-700 bg-gray-800 text-sm text-gray-100 px-2.5 pr-7 outline-none focus:border-gray-500 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ colorScheme: "dark" }}
            >
              {workflowAgents.map((a) => (
                <option key={a.graphId} value={a.graphId}>
                  {a.displayName}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
        </div>
        <Button
          className="cursor-pointer disabled:pointer-events-auto disabled:cursor-not-allowed"
          onClick={handleStartWorkflow}
          disabled={isWorkflowRunning}
        >
          Start Workflow
        </Button>
        <div className="ml-auto flex items-end gap-4">
          <StatusField
            label="Run Name"
            value={runMeta?.name}
            tooltip={currentThreadId ? `Run ID: ${currentThreadId}` : undefined}
            width="w-44"
          />
          <StatusField label="Status" value={mapStatusLabel(rawStatus) || undefined} width="w-28" />
          <StatusField label="Started At" value={runMeta?.startedAt ? formatLocalTime(runMeta.startedAt) : undefined} width="w-32" />
          <StatusField label="Completed At" value={runMeta?.completedAt ? formatLocalTime(runMeta.completedAt) : undefined} width="w-32" />
        </div>
      </div>

      <div className="flex flex-row flex-1 min-h-0 gap-4 px-6 pb-6">
        {/* Left: static graph definition */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <h2 className="text-sm font-semibold text-gray-300 pb-2">Graph</h2>
          <div className="flex-1 min-h-0">
            {graphLoading ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">
                Loading graph…
              </div>
            ) : graphError ? (
              <div className="flex items-center justify-center h-full text-sm text-red-400">
                {graphError}
              </div>
            ) : (
              <div className="h-full w-full">
                <ReactFlow
                  nodes={styledNodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  elementsSelectable={false}
                  proOptions={{ hideAttribution: true }}
                  fitView
                  fitViewOptions={{ padding: 0.2 }}
                  colorMode="dark"
                >
                  <Background />
                  <Controls showInteractive={false} />
                </ReactFlow>
              </div>
            )}
          </div>
        </div>

        {/* Right: messages and state */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <h2 className="text-sm font-semibold text-gray-300 pb-2">Messages</h2>
          <div className="flex-1 min-h-0 overflow-auto flex flex-col gap-3">
            {!currentThreadId ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-500">
                No workflow started yet.
              </div>
            ) : assistantMessages.length === 0 && !hasState ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-500">
                {isConnecting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Waiting for workflow…"}
              </div>
            ) : (
              <>
                {assistantMessages.length > 0 && (
                  <div className="font-mono text-sm text-gray-200 whitespace-pre-wrap bg-gray-900 rounded p-4">
                    {assistantMessages.map((m, i) => (
                      <div key={i} className={i > 0 ? "mt-3 pt-3 border-t border-gray-800" : ""}>
                        {typeof m.content === "string"
                          ? m.content
                          : JSON.stringify(m.content, null, 2)}
                      </div>
                    ))}
                  </div>
                )}
                {hasState && (
                  <div className="flex flex-col gap-2">
                    <h2 className="text-sm font-semibold text-gray-300">State</h2>
                    <pre className="font-mono text-sm text-gray-200 bg-gray-900 rounded p-4 overflow-auto">
                      {JSON.stringify(agent.state, null, 2)}
                    </pre>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
