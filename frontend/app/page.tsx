"use client";

import { useState, useEffect } from "react";
import { CopilotChat } from "@copilotkit/react-core/v2";

const DEFAULT_AGENT_ID = process.env.NEXT_PUBLIC_DEFAULT_CONVERSATIONAL_AGENT ?? "agent_convo_basic";
const THREAD_ID_KEY = "agentic-interface-conversational-threadid";

export default function Home() {
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
    return (
      <div className="flex flex-col h-screen overflow-hidden bg-gray-950">
        <div className="flex-none h-14 border-b border-gray-800 animate-pulse" />
        <div className="flex flex-1 min-h-0">
          <div className="flex-none w-64 border-r border-gray-800" />
          <div className="flex-1 bg-gray-950" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="flex-none h-14 flex items-center px-6 border-b border-gray-800 bg-gray-950">
        <h1 className="text-lg font-semibold text-gray-100">
          Agentic Interface (Proof of concept)
        </h1>
      </header>
      <div className="flex flex-1 min-h-0">
        <aside className="flex-none w-64 border-r border-gray-800 bg-gray-950">
          {/* Sidebar — to be fleshed out as a navbar in a later plan */}
        </aside>
        <main className="flex-1 min-h-0 flex flex-col">
          <CopilotChat
            className="h-full"
            agentId={DEFAULT_AGENT_ID}
            threadId={threadId}
            labels={{
              welcomeMessageText:
                "Hello! I have access to weekly stock price data and company overviews for the Magnificent 7 companies. Try asking me about Apple, Microsoft, Google, Amazon, Meta, Tesla, or Nvidia.",
            }}
          />
        </main>
      </div>
    </div>
  );
}
