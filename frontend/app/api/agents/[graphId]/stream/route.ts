import { Client } from "@langchain/langgraph-sdk";
import { type NextRequest } from "next/server";
import { AGENT_CONFIG } from "@/config/backend-config";

export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ graphId: string }> }
) => {
  const { graphId } = await params;
  const threadId = req.nextUrl.searchParams.get("threadId");

  const agentConfig = AGENT_CONFIG.find((a) => a.graphId === graphId);
  if (!agentConfig) {
    return Response.json({ error: `Unknown graphId: ${graphId}` }, { status: 400 });
  }
  if (!threadId) {
    return Response.json({ error: "Missing threadId query parameter" }, { status: 400 });
  }

  const client = new Client({ apiUrl: agentConfig.url, apiKey: null });

  // LangGraph creates the run in response to CopilotKit's request, which arrives in parallel.
  // Retry for up to 1 s to cover that race-condition window.
  let runId: string | undefined;
  for (let attempt = 0; attempt < 10 && !runId; attempt++) {
    if (attempt > 0) await new Promise<void>((resolve) => setTimeout(resolve, 100));
    const runs = await client.runs.list(threadId, { limit: 1 });
    if (runs[0]) runId = runs[0].run_id;
  }
  if (!runId) {
    return Response.json({ error: "No run found for thread" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const resolvedRunId = runId;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of client.runs.joinStream(threadId, resolvedRunId, {
          streamMode: "updates",
          cancelOnDisconnect: false,
          signal: req.signal,
        })) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: "stream_end" })}\n\n`));
      } catch (err) {
        if (!req.signal.aborted) {
          const message = err instanceof Error ? err.message : "Stream error";
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ event: "stream_error", data: message })}\n\n`)
          );
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
};
