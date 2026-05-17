"use client";

import { useEffect, useState } from "react";
import { useAgent, useCopilotKit } from "@copilotkit/react-core/v2";

const WORKFLOWS_KEY = "agentic-interface-workflows";

interface WorkflowEntry {
  threadId: string;
  graphId: string;
  status: "running" | "complete" | "error";
  startedAt: string;
  completedAt?: string;
}

export default function DebugReplayPage() {
  // undefined = not yet read; null = none found
  const [entry, setEntry] = useState<WorkflowEntry | null | undefined>(undefined);

  useEffect(() => {
    try {
      const entries: WorkflowEntry[] = JSON.parse(
        sessionStorage.getItem(WORKFLOWS_KEY) ?? "[]"
      );
      const completed = entries
        .filter((e) => e.status === "complete" || e.status === "error")
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      setEntry(completed[0] ?? null);
    } catch {
      setEntry(null);
    }
  }, []);

  if (entry === undefined) {
    return <div className="p-6 text-gray-500 font-mono text-sm">Reading session storage…</div>;
  }

  if (entry === null) {
    return (
      <div className="p-6 text-gray-400 font-mono text-sm">
        No completed workflow found in session storage.
        <br />
        Run a workflow at <code className="text-amber-300">/workflow</code> first, then return here.
      </div>
    );
  }

  return <ReplayView entry={entry} />;
}

function ReplayView({ entry }: { entry: WorkflowEntry }) {
  const { agent } = useAgent({ agentId: entry.graphId });
  const { copilotkit } = useCopilotKit();
  const [log, setLog] = useState<string[]>([]);

  function addLog(msg: string) {
    setLog((prev) => [...prev, `[${new Date().toISOString().slice(11, 23)}] ${msg}`]);
  }

  function triggerConnect() {
    addLog(`agent.isRunning=${agent.isRunning}`);
    addLog(`agent.messages.length=${agent.messages.length}`);
    agent.threadId = entry.threadId;
    addLog(`agent.threadId set to ${entry.threadId}`);
    addLog("calling copilotkit.connectAgent…");
    copilotkit
      .connectAgent({ agent })
      .then(() => addLog("connectAgent resolved ✓"))
      .catch((err: unknown) => addLog(`connectAgent error: ${String(err)}`));
  }

  // Fire on mount; also re-fires when agent changes provisional → real (matches CopilotChat behaviour)
  useEffect(() => {
    triggerConnect();
    return () => {
      agent.detachActiveRun().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent]);

  return (
    <div className="p-6 flex flex-col gap-5 overflow-auto h-full font-mono text-xs">
      <div className="flex items-center gap-4">
        <span className="text-sm font-semibold text-gray-100">/debug-replay</span>
        <button
          onClick={triggerConnect}
          className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 cursor-pointer text-xs"
        >
          Reconnect
        </button>
      </div>

      <section className="flex flex-col gap-0.5">
        <Row label="threadId" value={entry.threadId} />
        <Row label="graphId" value={entry.graphId} />
        <Row label="entry.status" value={entry.status} />
        <Row label="agent.isRunning" value={String(agent.isRunning)} />
        <Row label="agent.messages.length" value={String(agent.messages.length)} />
        <Row
          label="agent.state keys"
          value={Object.keys(agent.state ?? {}).join(", ") || "(none)"}
        />
      </section>

      <Block title="Log" content={log.join("\n") || "(empty)"} />

      <Block
        title={`agent.messages (${agent.messages.length})`}
        content={JSON.stringify(agent.messages, null, 2)}
        maxH="max-h-48"
      />

      <Block
        title="agent.state"
        content={JSON.stringify(agent.state, null, 2)}
        maxH="max-h-96"
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-gray-400">
      {label}:{" "}
      <span className="text-amber-300 break-all">{value}</span>
    </div>
  );
}

function Block({
  title,
  content,
  maxH = "max-h-48",
}: {
  title: string;
  content: string;
  maxH?: string;
}) {
  return (
    <section>
      <div className="text-gray-500 mb-1">{title}</div>
      <pre className={`bg-gray-900 rounded p-3 text-gray-300 whitespace-pre-wrap overflow-auto ${maxH}`}>
        {content}
      </pre>
    </section>
  );
}
