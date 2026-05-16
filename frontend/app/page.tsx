"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Conversation } from "@/components/Conversation";
import { Workflow } from "@/components/Workflow";

type View = "workflow" | "conversation";

export default function Home() {
  const [view, setView] = useState<View>("workflow");

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="flex-none h-14 flex items-center px-6 border-b border-gray-800 bg-gray-950">
        <Sparkles className="w-5 h-5 text-amber-400 mr-2 flex-none" />
        <h1 className="text-xl font-semibold text-gray-100">
          Agentic Interface (Proof of concept)
        </h1>
      </header>
      <div className="flex flex-1 min-h-0">
        <aside className="flex-none w-64 border-r border-gray-800 bg-gray-950">
          <Navbar activeView={view} onViewChange={setView} />
        </aside>
        <main className="flex-1 min-w-0 min-h-0 flex flex-col">
          {view === "workflow" ? <Workflow /> : <Conversation />}
        </main>
      </div>
    </div>
  );
}
