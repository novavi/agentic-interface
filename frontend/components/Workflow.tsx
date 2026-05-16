"use client";

import { useState } from "react";
import { useAgent, useCopilotKit } from "@copilotkit/react-core/v2";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import graphsData from "@/data/autonomous-agent-graphs.json";
import { WorkflowRawView } from "@/components/WorkflowRawView";
import { WorkflowVisualizer } from "@/components/WorkflowVisualizer";

interface AutonomousGraph {
  graphId: string;
  name: string;
  triggerMessage: string;
}

const graphs = graphsData as AutonomousGraph[];

type Tab = "graph" | "raw";

export function Workflow() {
  const [selectedGraphId, setSelectedGraphId] = useState<string>(graphs[0].graphId);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("graph");

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
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={activeTab === "graph" ? "secondary" : "ghost"}
            onClick={() => setActiveTab("graph")}
          >
            Graph
          </Button>
          <Button
            size="sm"
            variant={activeTab === "raw" ? "secondary" : "ghost"}
            onClick={() => setActiveTab("raw")}
          >
            Raw
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-0 px-6 pb-6">
        {activeTab === "graph" ? (
          <WorkflowVisualizer graphId={selectedGraphId} />
        ) : (
          <WorkflowRawView agent={agent} currentThreadId={currentThreadId} />
        )}
      </div>
    </div>
  );
}
