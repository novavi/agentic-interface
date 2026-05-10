"use client";

import { CopilotChat } from "@copilotkit/react-ui";

export default function Home() {
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
            instructions="You are a helpful assistant with access to stock price data for the Magnificent 7 companies (Apple, Microsoft, Google, Amazon, Meta, Tesla, Nvidia). Use the get-stock-data tool to look up stock prices when asked."
            labels={{
              initial:
                "Hello! I have access to weekly stock price data and company overviews for the Magnificent 7 companies. Try asking me about Apple, Microsoft, Google, Amazon, Meta, Tesla, or Nvidia.",
            }}
          />
        </main>
      </div>
    </div>
  );
}
