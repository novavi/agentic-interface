import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { LangGraphAgent } from "@copilotkit/runtime/langgraph";
import { NextRequest } from "next/server";

const runtime = new CopilotRuntime({
  agents: {
    agent_convo_basic: new LangGraphAgent({
      deploymentUrl: (process.env.LANGGRAPH_AGENT_CONVO_URL ?? "http://localhost:2024").trim(),
      graphId: "agent_convo_basic",
    }),
    agent_auto_ex_1: new LangGraphAgent({
      deploymentUrl: (process.env.LANGGRAPH_AGENT_AUTO_URL ?? "http://localhost:2025").trim(),
      graphId: "agent_auto_ex_1",
    }),
    agent_auto_ex_2: new LangGraphAgent({
      deploymentUrl: (process.env.LANGGRAPH_AGENT_AUTO_URL ?? "http://localhost:2025").trim(),
      graphId: "agent_auto_ex_2",
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
