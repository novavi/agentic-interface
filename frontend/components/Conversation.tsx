"use client";

import { CopilotChat } from "@copilotkit/react-core/v2";

const DEFAULT_AGENT_ID =
  process.env.NEXT_PUBLIC_DEFAULT_CONVERSATIONAL_AGENT ?? "agent_convo_basic";

interface ConversationProps {
  threadId: string;
}

export function Conversation({ threadId }: ConversationProps) {
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
