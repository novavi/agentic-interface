"use client";

import { Button } from "@/components/ui/button";

type View = "workflow" | "conversation";

interface NavbarProps {
  activeView: View;
  onViewChange: (view: View) => void;
}

const NAV_ITEMS: { view: View; label: string }[] = [
  { view: "workflow", label: "Workflow" },
  { view: "conversation", label: "Conversation" },
];

export function Navbar({ activeView, onViewChange }: NavbarProps) {
  return (
    <nav className="flex flex-col p-3 gap-1">
      {NAV_ITEMS.map(({ view, label }) => (
        <Button
          key={view}
          variant={activeView === view ? "secondary" : "ghost"}
          className="justify-start w-full cursor-pointer rounded-sm"
          onClick={() => onViewChange(view)}
        >
          {label}
        </Button>
      ))}
    </nav>
  );
}
