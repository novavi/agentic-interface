"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Tool = { id: string; label: string; enabled: boolean };

interface Props {
  company: string;
  tools: Tool[];
  resolve: (response: unknown) => void;
}

export function ToolSelectionDialog({ company, tools, resolve }: Props) {
  const [toggleState, setToggleState] = useState<Record<string, boolean>>(
    Object.fromEntries(tools.map((t) => [t.id, t.enabled])),
  );

  const allToolIds = tools.map((t) => t.id);
  const enabledIds = Object.entries(toggleState)
    .filter(([, on]) => on)
    .map(([id]) => id);
  const noneEnabled = enabledIds.length === 0;

  const handleApprove = () =>
    resolve({ action: "approve", enabled_tools: allToolIds });

  const handleModify = () =>
    resolve({ action: "modify", enabled_tools: enabledIds });

  const handleReject = () =>
    resolve({ action: "reject", enabled_tools: [] });

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 p-5 shadow-lg w-full max-w-sm">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-gray-100">
          Confirm Information Request
        </h3>
        <p className="mt-1 text-sm text-gray-400">
          Before retrieving information for{" "}
          <strong className="text-gray-200">{company}</strong>, choose which
          data sources to include:
        </p>
      </div>

      <div className="flex flex-col gap-3 py-2">
        {tools.map((tool) => (
          <div key={tool.id} className="flex items-center justify-between">
            <Label htmlFor={tool.id} className="text-sm font-medium text-gray-200">
              {tool.label}
            </Label>
            <Switch
              id={tool.id}
              checked={toggleState[tool.id]}
              onCheckedChange={(checked) =>
                setToggleState((prev) => ({ ...prev, [tool.id]: checked }))
              }
            />
          </div>
        ))}
        {noneEnabled && (
          <p className="text-xs text-gray-500">
            Enable at least one data source to use Modify, or click Reject to
            cancel.
          </p>
        )}
      </div>

      <div className="mt-4 flex justify-between">
        <Button
          variant="ghost"
          onClick={handleReject}
          className="text-gray-400 hover:text-gray-200"
        >
          Reject
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleModify}
            disabled={noneEnabled}
            className="border-gray-600 text-gray-200"
          >
            Modify
          </Button>
          <Button onClick={handleApprove}>Approve</Button>
        </div>
      </div>
    </div>
  );
}
