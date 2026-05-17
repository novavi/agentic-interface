"use client";

import { useState, useEffect, useCallback } from "react";
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

export function Workflow({ threadId: threadIdProp }: WorkflowProps) {
  const router = useRouter();
  const [selectedGraphId, setSelectedGraphId] = useState<string>(workflowAgents[0].graphId);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(threadIdProp);
  const [activeTab, setActiveTab] = useState<Tab>("graph");

  const { agent } = useAgent({ agentId: selectedGraphId });
  const { copilotkit } = useCopilotKit();

  // Keep currentThreadId in sync with the URL (back/forward navigation).
  useEffect(() => {
    setCurrentThreadId(threadIdProp);
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

  const handleStartWorkflow = async () => {
    const selectedAgent = workflowAgents.find((a) => a.graphId === selectedGraphId)!;
    const newThreadId = crypto.randomUUID();

    setCurrentThreadId(newThreadId);

    // Record the new run in session storage.
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

    agent.threadId = newThreadId;
    agent.setMessages([
      { id: crypto.randomUUID(), role: "user", content: selectedAgent.triggerMessage! },
    ]);
    copilotkit.runAgent({ agent }); // fire and forget — run continues regardless of navigation
    router.push(`/workflow/${newThreadId}`);
  };

  // Update the session storage entry when the SSE connection closes or errors.
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
  }, [currentThreadId]);

  const rawStatus = agent.state?.status as string | undefined;
  const statusLabel = rawStatus ? (STATUS_LABELS[rawStatus] ?? rawStatus) : "";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-none flex flex-col gap-3 px-6 pt-6 pb-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={selectedGraphId}
              onChange={(e) => handleGraphChange(e.target.value)}
              disabled={agent.isRunning}
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
            disabled={agent.isRunning}
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
        {currentThreadId && (
          <div className="flex flex-col gap-1">
            <p className="font-mono text-xs text-gray-400">Run ID: {currentThreadId}</p>
            <p className="font-mono text-xs text-gray-400">Status: {statusLabel}</p>
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 px-6 pb-6">
        {activeTab === "graph" ? (
          <WorkflowVisualizer
            graphId={selectedGraphId}
            currentThreadId={currentThreadId}
            isRunning={agent.isRunning}
            onConnectionStateChange={handleConnectionStateChange}
          />
        ) : (
          <WorkflowRawView agent={agent} />
        )}
      </div>
    </div>
  );
}
