"use client";

import { useState } from "react";
import { useAgent, useCopilotKit } from "@copilotkit/react-core/v2";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import graphsData from "@/data/autonomous-agent-graphs.json";

interface AutonomousGraph {
  graphId: string;
  name: string;
  triggerMessage: string;
}

const graphs = graphsData as AutonomousGraph[];

const STATUS_LABELS: Record<string, string> = {
  idle: "Idle",
  running: "Running…",
  complete: "Complete",
};

export function Workflow() {
  const [selectedGraphId, setSelectedGraphId] = useState<string>(graphs[0].graphId);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);

  const { agent } = useAgent({ agentId: selectedGraphId });
  const { copilotkit } = useCopilotKit();

  const handleGraphChange = (newGraphId: string) => {
    setSelectedGraphId(newGraphId);
    setCurrentThreadId(null);
  };

  const handleStartWorkflow = async () => {
    const selectedGraph = graphs.find((g) => g.graphId === selectedGraphId)!;
    const newThreadId = crypto.randomUUID();
    setCurrentThreadId(newThreadId);
    agent.threadId = newThreadId;
    agent.setMessages([
      { id: crypto.randomUUID(), role: "user", content: selectedGraph.triggerMessage },
    ]);
    await copilotkit.runAgent({ agent });
  };

  const assistantMessages = agent.messages.filter((m) => m.role === "assistant");
  const hasState = agent.state && Object.keys(agent.state).length > 0;
  const rawStatus = agent.state?.status as string | undefined;
  const statusLabel = rawStatus ? (STATUS_LABELS[rawStatus] ?? rawStatus) : "";

  return (
    <div className="flex flex-col h-full p-6 gap-6 overflow-auto">
      <div className="flex items-center gap-3">
        <div className="relative">
          <select
            value={selectedGraphId}
            onChange={(e) => handleGraphChange(e.target.value)}
            disabled={agent.isRunning}
            className="h-8 w-auto appearance-none rounded-md border border-gray-700 bg-gray-800 text-sm text-gray-100 px-2.5 pr-7 outline-none focus:border-gray-500 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ colorScheme: "dark" }}
          >
            {graphs.map((g) => (
              <option key={g.graphId} value={g.graphId}>
                {g.name}
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

      {currentThreadId && (
        <div className="flex flex-col gap-1">
          <p className="font-mono text-xs text-gray-400">Run ID: {currentThreadId}</p>
          <p className="font-mono text-xs text-gray-400">Status: {statusLabel}</p>
        </div>
      )}

      {currentThreadId && assistantMessages.length > 0 && (
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

      {currentThreadId && hasState && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-gray-300">State</h2>
          <pre className="font-mono text-sm text-gray-200 bg-gray-900 rounded p-4 overflow-auto">
            {JSON.stringify(agent.state, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
