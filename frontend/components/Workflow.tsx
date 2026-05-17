"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAgent, useCopilotKit } from "@copilotkit/react-core/v2";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AGENT_CONFIG } from "@/config/backend-config";
import { WorkflowRawView } from "@/components/WorkflowRawView";
import { WorkflowVisualizer } from "@/components/WorkflowVisualizer";
import type { ConnectionState } from "@/components/WorkflowVisualizer";

const WORKFLOWS_KEY = "agentic-interface-workflows";

interface WorkflowEntry {
  threadId: string;
  graphId: string;
  status: "running" | "complete" | "error";
  startedAt: string;
  completedAt?: string;
}

type WorkflowMode = "idle" | "run" | "view";

function resolveMode(threadId: string | null): WorkflowMode {
  if (!threadId) return "idle";
  // All cases where we have a threadId default to view.
  // run mode is set imperatively via handleStartWorkflow — never derived from URL.
  return "view";
}

const workflowAgents = AGENT_CONFIG.filter((a) => a.isWorkflowGraph);

const STATUS_LABELS: Record<string, string> = {
  idle: "Idle",
  running: "Running…",
  complete: "Complete",
};

type Tab = "graph" | "raw";

interface WorkflowProps {
  threadId: string | null;
}

// ─── Outer component: routing / navigation only ───────────────────────────────

export function Workflow({ threadId: threadIdProp }: WorkflowProps) {
  const router = useRouter();
  const [selectedGraphId, setSelectedGraphId] = useState<string>(workflowAgents[0].graphId);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(threadIdProp);
  const [activeTab, setActiveTab] = useState<Tab>("graph");
  const [mode, setMode] = useState<WorkflowMode>(() => resolveMode(threadIdProp));
  // Tracks whether a workflow is actively running in this browser session,
  // used to disable the Start button and graph selector during a run.
  const [isWorkflowRunning, setIsWorkflowRunning] = useState(false);

  // Keep currentThreadId and mode in sync with the URL (back/forward navigation).
  useEffect(() => {
    setCurrentThreadId(threadIdProp);
    setMode(resolveMode(threadIdProp));
  }, [threadIdProp]);

  // When loading from a URL with a threadId, restore the graphId from session storage.
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

  const handleGraphChange = (newGraphId: string) => {
    setSelectedGraphId(newGraphId);
    router.push("/workflow");
  };

  const handleStartWorkflow = () => {
    const newThreadId = crypto.randomUUID();
    try {
      const entries: WorkflowEntry[] = JSON.parse(sessionStorage.getItem(WORKFLOWS_KEY) ?? "[]");
      entries.push({
        threadId: newThreadId,
        graphId: selectedGraphId,
        status: "running",
        startedAt: new Date().toISOString(),
      });
      sessionStorage.setItem(WORKFLOWS_KEY, JSON.stringify(entries));
    } catch {
      // ignore
    }
    setIsWorkflowRunning(true);
    setCurrentThreadId(newThreadId);
    setMode("run"); // imperative: only path into run mode
    router.push(`/workflow/${newThreadId}`);
    // WorkflowSession is keyed by currentThreadId — changing the key unmounts the old
    // instance (discarding all accumulated agent state) and mounts a fresh one.
    // The fresh session sees autoRun=true (mode==="run") and calls runAgent on mount.
  };

  const handleConnectionStateChange = useCallback((state: ConnectionState) => {
    if (!currentThreadId || state === "open") return;
    try {
      const entries: WorkflowEntry[] = JSON.parse(sessionStorage.getItem(WORKFLOWS_KEY) ?? "[]");
      const idx = entries.findIndex((w) => w.threadId === currentThreadId);
      if (idx !== -1) {
        entries[idx].status = state === "closed" ? "complete" : "error";
        entries[idx].completedAt = new Date().toISOString();
        sessionStorage.setItem(WORKFLOWS_KEY, JSON.stringify(entries));
      }
    } catch {
      // ignore
    }
    setIsWorkflowRunning(false);
    setMode("view");
  }, [currentThreadId]);

  // Called by WorkflowSession when agent.isRunning transitions true → false.
  const handleRunComplete = useCallback(() => {
    setIsWorkflowRunning(false);
    try {
      const entries: WorkflowEntry[] = JSON.parse(sessionStorage.getItem(WORKFLOWS_KEY) ?? "[]");
      const idx = entries.findIndex((w) => w.threadId === currentThreadId);
      if (idx !== -1 && entries[idx].status === "running") {
        entries[idx].status = "complete";
        entries[idx].completedAt = new Date().toISOString();
        sessionStorage.setItem(WORKFLOWS_KEY, JSON.stringify(entries));
      }
    } catch {
      // ignore
    }
  }, [currentThreadId]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-none flex flex-col gap-3 px-6 pt-6 pb-3">
        <div className="flex items-center gap-3">
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
          <Button
            className="cursor-pointer disabled:pointer-events-auto disabled:cursor-not-allowed"
            onClick={handleStartWorkflow}
            disabled={isWorkflowRunning}
          >
            Start Workflow
          </Button>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={activeTab === "graph" ? "secondary" : "ghost"}
            className="cursor-pointer"
            onClick={() => setActiveTab("graph")}
          >
            Graph
          </Button>
          <Button
            size="sm"
            variant={activeTab === "raw" ? "secondary" : "ghost"}
            className="cursor-pointer"
            onClick={() => setActiveTab("raw")}
          >
            Raw
          </Button>
        </div>
      </div>
      {/* key={currentThreadId} ensures a fresh agent instance for each run/thread */}
      <WorkflowSession
        key={currentThreadId ?? "idle"}
        threadId={currentThreadId}
        graphId={selectedGraphId}
        autoRun={mode === "run"}
        activeTab={activeTab}
        onConnectionStateChange={handleConnectionStateChange}
        onRunComplete={handleRunComplete}
      />
    </div>
  );
}

// ─── Inner component: agent lifecycle / rendering ─────────────────────────────
// Mounted fresh for each threadId. useAgent returns a clean instance with empty
// state and messages, preventing cross-run state accumulation.

interface WorkflowSessionProps {
  threadId: string | null;
  graphId: string;
  autoRun: boolean; // true only when mounted for a new run; captured in ref, not reactive
  activeTab: Tab;
  onConnectionStateChange: (state: ConnectionState) => void;
  onRunComplete: () => void;
}

function WorkflowSession({
  threadId,
  graphId,
  autoRun,
  activeTab,
  onConnectionStateChange,
  onRunComplete,
}: WorkflowSessionProps) {
  const { agent } = useAgent({ agentId: graphId });
  const { copilotkit } = useCopilotKit();
  const [isConnecting, setIsConnecting] = useState(false);

  const autoRunRef = useRef(autoRun); // captured at mount — not reactive
  const runStartedRef = useRef(false); // prevent double runAgent on provisional→real transition
  const lastViewedThreadIdRef = useRef<string | null>(null);
  const wasRunningRef = useRef(false); // for run-completion detection

  // Stable ref for onRunComplete so the isRunning effect doesn't need it as a dep.
  const onRunCompleteRef = useRef(onRunComplete);
  useEffect(() => { onRunCompleteRef.current = onRunComplete; }, [onRunComplete]);

  // Main agent effect: start the run or connect to replay, depending on session type.
  // Deps: [agent] — re-fires when provisional agent transitions to real agent.
  useEffect(() => {
    if (!threadId) return;

    if (autoRunRef.current) {
      // Run mode: call runAgent exactly once. The provisional→real re-fire is a no-op.
      if (runStartedRef.current) return;
      runStartedRef.current = true;
      const selectedAgent = workflowAgents.find((a) => a.graphId === graphId)!;
      agent.threadId = threadId;
      // Clear any state/messages from previous runs held in the global agent cache
      // before starting the new run — prevents stale data bleeding into the new thread.
      agent.setState({});
      agent.setMessages([
        { id: crypto.randomUUID(), role: "user", content: selectedAgent.triggerMessage! },
      ]);
      copilotkit.runAgent({ agent });
      return;
    }

    // View mode: replay completed thread history via connectAgent.
    // Skip if agent already has data — avoids a flash of empty state.
    const hasData =
      (agent.messages?.length ?? 0) > 0 ||
      Object.keys(agent.state ?? {}).length > 0;
    if (hasData) {
      lastViewedThreadIdRef.current = threadId;
      return;
    }

    // Skip redundant calls when only agent changes (provisional → real) for the same thread.
    if (lastViewedThreadIdRef.current === threadId) return;
    lastViewedThreadIdRef.current = threadId;

    agent.threadId = threadId;
    setIsConnecting(true);
    copilotkit
      .connectAgent({ agent })
      .then(() => setIsConnecting(false))
      .catch(() => setIsConnecting(false));

    return () => {
      lastViewedThreadIdRef.current = null; // allow retry on StrictMode remount
      agent.detachActiveRun().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent]);

  // Run-completion detection: fires when isRunning transitions true → false.
  useEffect(() => {
    if (agent.isRunning) {
      wasRunningRef.current = true;
    } else if (wasRunningRef.current) {
      wasRunningRef.current = false;
      onRunCompleteRef.current();
    }
  }, [agent.isRunning]);

  // Reading agent.messages and agent.state here (not just .status) subscribes this
  // component to their changes, so re-renders propagate to WorkflowRawView on every
  // message/state update during a live run.
  const agentMessages = agent.messages;
  const agentState = agent.state;
  const rawStatus = (agentState?.status as string | undefined);
  const statusLabel = rawStatus ? (STATUS_LABELS[rawStatus] ?? rawStatus) : "";

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {threadId && (
        <div className="flex-none flex flex-col gap-1 px-6 pb-3">
          <p className="font-mono text-xs text-gray-400">Run ID: {threadId}</p>
          <p className="font-mono text-xs text-gray-400">Status: {statusLabel}</p>
        </div>
      )}
      <div className={activeTab === "graph" ? "flex-1 min-h-0 px-6 pb-6" : "hidden"}>
        <WorkflowVisualizer
          graphId={graphId}
          currentThreadId={null}
          isRunning={agent.isRunning}
          onConnectionStateChange={onConnectionStateChange}
        />
      </div>
      <div className={activeTab === "raw" ? "flex-1 min-h-0 px-6 pb-6 overflow-auto" : "hidden"}>
        {threadId ? (
          <WorkflowRawView messages={agentMessages} state={agentState} isLoading={isConnecting} />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-gray-500">
            No workflow started yet.
          </div>
        )}
      </div>
    </div>
  );
}
