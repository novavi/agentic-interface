"use client";

import { useState, useEffect } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";

const CONVERSATIONS_KEY = "agentic-interface-conversations";
const WORKFLOWS_KEY = "agentic-interface-workflows";
const CONVERSATION_GRAPH_ID = "agent_convo_basic";

export interface ConversationEntry {
  threadId: string;
  graphId: string;
  name: string;
  createdAt: string;
}

function initSessionStorage(): ConversationEntry[] {
  let conversations: ConversationEntry[] = [];
  try {
    conversations = JSON.parse(sessionStorage.getItem(CONVERSATIONS_KEY) ?? "[]");
  } catch {
    conversations = [];
  }

  const names = ["Conversation 1", "Conversation 2"];
  let changed = false;
  while (conversations.length < 2) {
    conversations.push({
      threadId: crypto.randomUUID(),
      graphId: CONVERSATION_GRAPH_ID,
      name: names[conversations.length],
      createdAt: new Date().toISOString(),
    });
    changed = true;
  }
  if (changed) sessionStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));

  if (!sessionStorage.getItem(WORKFLOWS_KEY)) {
    sessionStorage.setItem(WORKFLOWS_KEY, JSON.stringify([]));
  }

  return conversations;
}

export function LayoutClient({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<ConversationEntry[] | null>(null);

  useEffect(() => {
    setConversations(initSessionStorage());
  }, []);

  if (!conversations) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="flex-none h-14 flex items-center px-6 border-b border-gray-800 bg-gray-950">
        <Sparkles className="w-5 h-5 text-amber-400 mr-2 flex-none" />
        <h1 className="text-xl font-semibold text-gray-100">
          Agentic Interface - Proof of Concept by Derek Novavi
        </h1>
      </header>
      <div className="flex flex-1 min-h-0">
        <aside className="flex-none w-64 border-r border-gray-800 bg-gray-950">
          <Navbar conversations={conversations} />
        </aside>
        <main className="flex-1 min-w-0 min-h-0 flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
