import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { LangGraphAgent } from "@copilotkit/runtime/langgraph";
import { NextRequest } from "next/server";
import { AGENT_CONFIG } from "@/config/backend-config";

// Note: The below logic builds the agents map required by CopilotRuntime. It is equivalent to:
//   agents: {
//     myAgentGraph: new LangGraphAgent({
//       deploymentUrl: "<MY_AGENT_URL>",
//       graphId: "myAgentGraph",
//     }),
//     ...
//   }
const runtime = new CopilotRuntime({
  agents: Object.fromEntries(
    AGENT_CONFIG.map(({ graphId, url }) => [
      graphId,
      new LangGraphAgent({ deploymentUrl: url, graphId }),
    ])
  ),
});

export const POST = async (req: NextRequest) => {
  const reqClone = req.clone();
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter: new ExperimentalEmptyAdapter(),
    endpoint: "/api/copilotkit",
  });
  const response = await handleRequest(req);
  try {
    const body = await reqClone.json();
    console.log(JSON.stringify(body, undefined, 2));
  } catch (err) {
    console.error("[copilotkit] failed to parse request body:", err);
  }
  return response;
};
