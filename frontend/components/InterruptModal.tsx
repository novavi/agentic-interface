"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Tool = { id: string; label: string; enabled: boolean };

export type ToolSelectionPayload = {
  type: string;
  company: string;
  tools: Tool[];
};

interface InterruptModalProps {
  isOpen: boolean;
  data: ToolSelectionPayload | null;
  onResponse: (response: { action: string; enabled_tools: string[] }) => void;
  onClose: () => void;
}

export function InterruptModal({
  isOpen,
  data,
  onResponse,
  onClose,
}: InterruptModalProps) {
  const [toggleState, setToggleState] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (data) {
      setToggleState(Object.fromEntries(data.tools.map((t) => [t.id, t.enabled])));
    }
  }, [data]);

  if (!data) return null;

  const allToolIds = data.tools.map((t) => t.id);
  const enabledIds = Object.entries(toggleState)
    .filter(([, on]) => on)
    .map(([id]) => id);
  const noneEnabled = enabledIds.length === 0;

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          onClose();
        }}
        onInteractOutside={(e) => {
          e.preventDefault();
          onClose();
        }}
      >
        <DialogHeader>
          <DialogTitle>Confirm Information Request</DialogTitle>
          <DialogDescription>
            Before retrieving information for{" "}
            <strong>{data.company}</strong>, choose which data sources to
            include:
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {data.tools.map((tool) => (
            <div key={tool.id} className="flex items-center justify-between">
              <Label htmlFor={tool.id} className="text-sm font-medium">
                {tool.label}
              </Label>
              <Switch
                id={tool.id}
                checked={toggleState[tool.id] ?? tool.enabled}
                onCheckedChange={(checked) =>
                  setToggleState((prev) => ({ ...prev, [tool.id]: checked }))
                }
              />
            </div>
          ))}
          {noneEnabled && (
            <p className="text-xs text-muted-foreground">
              Enable at least one data source to use Modify, or click Reject to
              cancel.
            </p>
          )}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button variant="ghost" onClick={onClose}>
            Reject
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                onResponse({ action: "modify", enabled_tools: enabledIds })
              }
              disabled={noneEnabled}
            >
              Modify
            </Button>
            <Button
              onClick={() =>
                onResponse({ action: "approve", enabled_tools: allToolIds })
              }
            >
              Approve
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
