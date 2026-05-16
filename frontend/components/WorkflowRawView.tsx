"use client";

const STATUS_LABELS: Record<string, string> = {
  idle: "Idle",
  running: "Running…",
  complete: "Complete",
};

interface WorkflowRawViewProps {
  agent: {
    messages: Array<{ id?: string; role: string; content: unknown }>;
    state?: Record<string, unknown> | null;
  };
  currentThreadId: string | null;
}

export function WorkflowRawView({ agent, currentThreadId }: WorkflowRawViewProps) {
  const assistantMessages = agent.messages.filter((m) => m.role === "assistant");
  const hasState = agent.state && Object.keys(agent.state).length > 0;
  const rawStatus = agent.state?.status as string | undefined;
  const statusLabel = rawStatus ? (STATUS_LABELS[rawStatus] ?? rawStatus) : "";

  if (!currentThreadId) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-500">
        No workflow started yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full overflow-auto">
      <div className="flex flex-col gap-1">
        <p className="font-mono text-xs text-gray-400">Run ID: {currentThreadId}</p>
        <p className="font-mono text-xs text-gray-400">Status: {statusLabel}</p>
      </div>

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
  );
}
