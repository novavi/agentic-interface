"use client";

import { useState, useEffect, useRef } from "react";
import { CopilotKit, useLangGraphInterrupt } from "@copilotkit/react-core";
import { CopilotChat } from "@copilotkit/react-ui";
import { ToolRenderer } from "@/components/ToolRenderer";
import { InterruptModal, type ToolSelectionPayload } from "@/components/InterruptModal";

const THREAD_ID_KEY = "agentic-interface-conversational-threadid";

function LangGraphInterruptHandler({ threadId }: { threadId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const dataRef = useRef<ToolSelectionPayload | null>(null);
  const resolveRef = useRef<((value: string) => void) | null>(null);

  useLangGraphInterrupt<ToolSelectionPayload>({
    enabled: ({ eventValue }) => eventValue?.type === "tool_selection",
    render: ({ event, resolve }) => {
      resolveRef.current = resolve;
      dataRef.current = event.value as ToolSelectionPayload;
      setTimeout(() => setIsOpen(true), 0);
      return <></>;
    },
  });

  const handleResponse = (response: { action: string; enabled_tools: string[] }) => {
    resolveRef.current?.(JSON.stringify(response));
    setIsOpen(false);
    dataRef.current = null;
  };

  const handleClose = () => {
    resolveRef.current?.(JSON.stringify({ action: "reject", enabled_tools: [] }));
    setIsOpen(false);
    dataRef.current = null;
  };

  return (
    <InterruptModal
      isOpen={isOpen}
      data={dataRef.current}
      onResponse={handleResponse}
      onClose={handleClose}
    />
  );
}

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
      <CopilotKit runtimeUrl="/api/copilotkit" agent="agent">
        <ToolRenderer />
        <LangGraphInterruptHandler threadId={threadId} />
        <div className="flex flex-1 min-h-0">
          <aside className="flex-none w-64 border-r border-gray-800 bg-gray-950">
            {/* Sidebar — to be fleshed out as a navbar in a later plan */}
          </aside>
          <main className="flex-1 min-h-0 flex flex-col">
            <CopilotChat
              className="h-full"
              threadId={threadId}
              labels={{
                welcomeMessageText:
                  "Hello! I have access to weekly stock price data and company overviews for the Magnificent 7 companies. Try asking me about Apple, Microsoft, Google, Amazon, Meta, Tesla, or Nvidia. You can say 'Get stock price for Apple' and 'Get overview of Microsoft'. You can also say 'Get info for Google' to choose which data sources to include before I respond.",
              }}
            />
          </main>
        </div>
      </CopilotKit>
    </div>
  );
}
