"use client";

import { useEffect, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  themeQuartz,
  colorSchemeDark,
  type ColDef,
} from "ag-grid-community";
import { AGENT_CONFIG } from "@/config/backend-config";

const WORKFLOWS_KEY = "agentic-interface-workflows";

interface WorkflowEntry {
  threadId: string;
  graphId: string;
  workflowRunName?: string;
  status: string;
  startedAt: string;
  completedAt?: string;
}

interface RowData {
  workflowRunName: string;
  threadId: string;
  graphName: string;
  graphId: string;
  status: string;
  startedAt: string;
  completedAt: string;
}

const theme = themeQuartz.withPart(colorSchemeDark);

const colDefs: ColDef<RowData>[] = [
  { field: "workflowRunName", headerName: "Workflow Run Name", flex: 1 },
  { field: "threadId", headerName: "Run ID", flex: 2 },
  { field: "graphName", headerName: "Graph Name", flex: 1 },
  { field: "graphId", headerName: "Graph ID", flex: 1 },
  { field: "status", headerName: "Status", flex: 1 },
  { field: "startedAt", headerName: "Started At", flex: 1.5 },
  { field: "completedAt", headerName: "Completed At", flex: 1.5 },
];

export function ViewWorkflows() {
  const [rowData, setRowData] = useState<RowData[]>([]);

  useEffect(() => {
    try {
      const entries: WorkflowEntry[] = JSON.parse(
        sessionStorage.getItem(WORKFLOWS_KEY) ?? "[]"
      );
      setRowData(
        entries.map((e) => ({
          workflowRunName: e.workflowRunName ?? "",
          threadId: e.threadId,
          graphName:
            AGENT_CONFIG.find((a) => a.graphId === e.graphId)?.displayName ??
            e.graphId,
          graphId: e.graphId,
          status: e.status,
          startedAt: e.startedAt,
          completedAt: e.completedAt ?? "",
        }))
      );
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <h1 className="text-sm font-semibold text-gray-300">Workflow Runs</h1>
      <div className="flex-1 min-h-0">
        <AgGridReact
          theme={theme}
          modules={[AllCommunityModule]}
          rowData={rowData}
          columnDefs={colDefs}
        />
      </div>
    </div>
  );
}
