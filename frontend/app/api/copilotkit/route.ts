import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { LangGraphAgent } from "@copilotkit/runtime/langgraph";
import { NextRequest } from "next/server";

const agentUrl = (
  process.env.LANGGRAPH_AGENT_CONVO_URL ?? "http://localhost:2024"
).trim();

const runtime = new CopilotRuntime({
  agents: {
    agent: new LangGraphAgent({
      deploymentUrl: agentUrl,
      graphId: "agent",
    }),
  },
});

export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter: new ExperimentalEmptyAdapter(),
    endpoint: "/api/copilotkit",
  });
  return handleRequest(req);
};
