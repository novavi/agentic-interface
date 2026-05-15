"use client";

import { useState, useEffect } from "react";
import { CopilotChat } from "@copilotkit/react-core/v2";

const DEFAULT_AGENT_ID = process.env.NEXT_PUBLIC_DEFAULT_CONVERSATIONAL_AGENT ?? "agent_convo_basic";
const THREAD_ID_KEY = "agentic-interface-conversational-threadid";

export function Conversation() {
  const [threadId, setThreadId] = useState<string | null>(null);

  useEffect(() => {
    let id = sessionStorage.getItem(THREAD_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(THREAD_ID_KEY, id);
    }
    setThreadId(id);
  }, []);

  if (!threadId) {
    return <div className="flex-1 bg-gray-950 animate-pulse" />;
  }

  return (
    <CopilotChat
      className="h-full"
      agentId={DEFAULT_AGENT_ID}
      threadId={threadId}
      labels={{
        welcomeMessageText:
          "Hello! I have access to weekly stock price data and company overviews for the Magnificent 7 companies. Try asking me about Apple, Microsoft, Google, Amazon, Meta, Tesla, or Nvidia.",
      }}
    />
  );
}
