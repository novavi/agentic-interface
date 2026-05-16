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
  const cloned = req.clone();
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter: new ExperimentalEmptyAdapter(),
    endpoint: "/api/copilotkit",
  });
  const response = await handleRequest(req);
  try {
    const body = await cloned.json();
    if (Array.isArray(body.messages) && body.messages.length > 0) {
      console.log(JSON.stringify(body.messages));
    }
  } catch {
    // body not parseable as JSON (Connect protocol framing may differ)
  }
  return response;
};
