"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ConversationEntry } from "@/components/LayoutClient";

interface NavbarProps {
  conversations: ConversationEntry[];
}

export function Navbar({ conversations }: NavbarProps) {
  const pathname = usePathname();

  const workflowActive =
    pathname === "/workflow" || pathname.startsWith("/workflow/");
  const workflowV2Active =
    pathname === "/workflow-v2" || pathname.startsWith("/workflow-v2/");
  const viewWorkflowsActive = pathname === "/view-workflows";

  return (
    <nav className="flex flex-col p-3 gap-1">
      <span className="px-2 py-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
        Workflows
      </span>
      <Button
        variant={workflowActive ? "secondary" : "ghost"}
        size="sm"
        className={cn("justify-start w-full cursor-pointer rounded-sm")}
        asChild
      >
        <Link href="/workflow">Run Workflow</Link>
      </Button>
      <Button
        variant={workflowV2Active ? "secondary" : "ghost"}
        size="sm"
        className={cn("justify-start w-full cursor-pointer rounded-sm")}
        asChild
      >
        <Link href="/workflow-v2">Run Workflow V2</Link>
      </Button>
      <Button
        variant={viewWorkflowsActive ? "secondary" : "ghost"}
        size="sm"
        className={cn("justify-start w-full cursor-pointer rounded-sm")}
        asChild
      >
        <Link href="/view-workflows">View Workflows</Link>
      </Button>

      <span className="px-2 py-1 mt-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
        Conversations
      </span>
      {conversations.map((conv) => {
        const href = `/conversation/${conv.threadId}`;
        const isActive = pathname === href;
        return (
          <Button
            key={conv.threadId}
            variant={isActive ? "secondary" : "ghost"}
            size="sm"
            className="justify-start w-full cursor-pointer rounded-sm"
            asChild
          >
            <Link href={href}>{conv.name}</Link>
          </Button>
        );
      })}
    </nav>
  );
}
