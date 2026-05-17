"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAgent, useCopilotKit } from "@copilotkit/react-core/v2";
import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AGENT_CONFIG } from "@/config/backend-config";

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

  // Sync currentThreadId with URL (back/forward navigation).
  useEffect(() => {
    setCurrentThreadId(threadIdProp);
  }, [threadIdProp]);

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

    const hasData =
      (agent.messages?.length ?? 0) > 0 ||
      Object.keys(agent.state ?? {}).length > 0;
    if (hasData) {
      viewConnectedRef.current = threadIdProp;
      return;
    }

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
          entries[idx].status = "complete";
          entries[idx].completedAt = new Date().toISOString();
          sessionStorage.setItem(WORKFLOWS_KEY, JSON.stringify(entries));
        }
      } catch {
        // ignore
      }
    } catch {
      try {
        const entries: WorkflowEntry[] = JSON.parse(sessionStorage.getItem(WORKFLOWS_KEY) ?? "[]");
        const idx = entries.findIndex((w) => w.threadId === newThreadId);
        if (idx !== -1) {
          entries[idx].status = "error";
          entries[idx].completedAt = new Date().toISOString();
          sessionStorage.setItem(WORKFLOWS_KEY, JSON.stringify(entries));
        }
      } catch {
        // ignore
      }
    } finally {
      setIsWorkflowRunning(false);
    }
  };

  const rawStatus = agent.state?.status as string | undefined;
  const statusLabel = rawStatus ? (STATUS_LABELS[rawStatus] ?? rawStatus) : "";
  const assistantMessages = agent.messages.filter((m) => m.role === "assistant");
  const hasState = agent.state && Object.keys(agent.state).length > 0;

  return (
    <div className="flex flex-col h-full p-6 gap-6 overflow-auto">
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

      {currentThreadId && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <p className="font-mono text-xs text-gray-400">Run ID: {currentThreadId}</p>
            <p className="font-mono text-xs text-gray-400">Status: {statusLabel}</p>
          </div>

          {assistantMessages.length === 0 && !hasState && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              <span>{isConnecting ? "Connecting…" : "Waiting for workflow…"}</span>
            </div>
          )}

          {assistantMessages.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-gray-300">Messages</h2>
              <div className="font-mono text-sm text-gray-200 whitespace-pre-wrap bg-gray-900 rounded p-4">
                {assistantMessages.map((m, i) => (
                  <div key={i} className={i > 0 ? "mt-3 pt-3 border-t border-gray-800" : ""}>
                    {typeof m.content === "string"
                      ? m.content
                      : JSON.stringify(m.content, null, 2)}
                  </div>
                ))}
              </div>
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
        </div>
      )}
    </div>
  );
}
