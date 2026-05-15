"use client";

import { useState } from "react";
import { useAgent, useCopilotKit } from "@copilotkit/react-core/v2";
import { Button } from "@/components/ui/button";

const AGENT_ID = process.env.NEXT_PUBLIC_DEFAULT_AUTONOMOUS_AGENT ?? "agent_auto_example";

export function Workflow() {
  const { agent } = useAgent({ agentId: AGENT_ID });
  const { copilotkit } = useCopilotKit();
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);

  const handleStartWorkflow = async () => {
    const newThreadId = crypto.randomUUID();
    setCurrentThreadId(newThreadId);
    agent.threadId = newThreadId;
    agent.setMessages([
      { id: crypto.randomUUID(), role: "user", content: "start workflow" },
    ]);
    await copilotkit.runAgent({ agent });
  };

  const assistantMessages = agent.messages.filter((m) => m.role === "assistant");
  const hasState = agent.state && Object.keys(agent.state).length > 0;

  return (
    <div className="flex flex-col h-full p-6 gap-6 overflow-auto">
      <div>
        <Button className="cursor-pointer" onClick={handleStartWorkflow}>Start Workflow</Button>
      </div>

      {currentThreadId && (
        <div className="flex flex-col gap-6">
          <p className="font-mono text-xs text-gray-400">
            Run ID: {currentThreadId}
          </p>

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
