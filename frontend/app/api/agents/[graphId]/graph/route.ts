import { RemoteGraph } from "@langchain/langgraph/remote";
import { type NextRequest } from "next/server";

const DEPLOYMENT_URLS: Record<string, string> = {
  agent_auto_ex_1: (process.env.LANGGRAPH_AGENT_AUTO_URL ?? "http://localhost:2025").trim(),
  agent_auto_ex_2: (process.env.LANGGRAPH_AGENT_AUTO_URL ?? "http://localhost:2025").trim(),
  agent_convo_basic: (process.env.LANGGRAPH_AGENT_CONVO_URL ?? "http://localhost:2024").trim(),
};

export const GET = async (
  _req: NextRequest,
  { params }: { params: Promise<{ graphId: string }> }
) => {
  const { graphId } = await params;
  const url = DEPLOYMENT_URLS[graphId];
  if (!url) {
    return Response.json({ error: `Unknown graphId: ${graphId}` }, { status: 400 });
  }
  try {
    const remoteGraph = new RemoteGraph({ graphId, url });
    const graph = await remoteGraph.getGraphAsync({ xray: false });
    return Response.json(graph);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream error";
    return Response.json({ error: message }, { status: 502 });
  }
};
