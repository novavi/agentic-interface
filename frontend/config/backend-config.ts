// url fields are server-side only — env vars without NEXT_PUBLIC_ are undefined on the client.
// getAgentGraphUrl is client-safe (pure string interpolation, no env vars).

interface AgentConfigEntry {
  graphId: string;
  url: string;
  isWorkflowGraph: boolean;
  displayName?: string;
  triggerMessage?: string;
}

export const AGENT_CONFIG: AgentConfigEntry[] = [
  {
    graphId: "agent_convo_basic",
    url: (process.env.LANGGRAPH_AGENT_CONVO_URL ?? "http://localhost:2024").trim(),
    isWorkflowGraph: false,
  },
  {
    graphId: "agent_auto_ex_1",
    url: (process.env.LANGGRAPH_AGENT_AUTO_URL ?? "http://localhost:2025").trim(),
    isWorkflowGraph: true,
    displayName: "Example 1 Workflow",
    triggerMessage: "start workflow",
  },
  {
    graphId: "agent_auto_ex_2",
    url: (process.env.LANGGRAPH_AGENT_AUTO_URL ?? "http://localhost:2025").trim(),
    isWorkflowGraph: true,
    displayName: "Example 2 Workflow",
    triggerMessage: "start workflow",
  },
];

export const getAgentGraphUrl = (graphId: string) => `/api/agents/${graphId}/graph`;

export const getAgentStreamUrl = (graphId: string, threadId: string) =>
  `/api/agents/${graphId}/stream?threadId=${encodeURIComponent(threadId)}`;
