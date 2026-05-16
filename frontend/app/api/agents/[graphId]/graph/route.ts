import { RemoteGraph } from "@langchain/langgraph/remote";
import { type NextRequest } from "next/server";
import { AGENT_CONFIG } from "@/config/backend-config";

export const GET = async (
  _req: NextRequest,
  { params }: { params: Promise<{ graphId: string }> }
) => {
  const { graphId } = await params;
  const agentConfig = AGENT_CONFIG.find((a) => a.graphId === graphId);
  if (!agentConfig) {
    return Response.json({ error: `Unknown graphId: ${graphId}` }, { status: 400 });
  }
  try {
    const remoteGraph = new RemoteGraph({ graphId, url: agentConfig.url });
    const graph = await remoteGraph.getGraphAsync({ xray: false });
    return Response.json(graph);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream error";
    return Response.json({ error: message }, { status: 502 });
  }
};
