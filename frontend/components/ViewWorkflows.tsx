"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  themeQuartz,
  colorSchemeDark,
  type ColDef,
  type ICellRendererParams,
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
  status: string;
  startedAt: string;
  completedAt: string;
}

const theme = themeQuartz.withPart(colorSchemeDark).withParams({
  backgroundColor: "#0d1117",
  chromeBackgroundColor: "#161b22",
  oddRowBackgroundColor: "#0d1117",
  rowHoverColor: "#21262d",
  borderColor: "#30363d",
  foregroundColor: "#e6edf3",
  wrapperBorderRadius: 0,
  borderRadius: 0,
  columnBorder: true,
  headerColumnBorder: true,
  headerColumnBorderHeight: "100%",
});

function WorkflowRunNameRenderer({ value, data }: ICellRendererParams<RowData>) {
  if (!data?.threadId) return value as string;
  return (
    <Link
      href={`/workflow-v2/${data.threadId}`}
      className="text-blue-400 hover:text-blue-300 hover:underline"
    >
      {value as string}
    </Link>
  );
}

function formatLocalTime(isoString: string): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

const colDefs: ColDef<RowData>[] = [
  { field: "workflowRunName", headerName: "Workflow Run Name", flex: 1, cellRenderer: WorkflowRunNameRenderer },
  { field: "threadId", headerName: "Workflow Run ID", flex: 2 },
  { field: "graphName", headerName: "Graph Name", flex: 1 },
  { field: "status", headerName: "Status", flex: 1 },
  {
    field: "startedAt",
    headerName: "Started At",
    flex: 1,
    sort: "desc",
    valueFormatter: ({ value }) => formatLocalTime(value as string),
  },
  {
    field: "completedAt",
    headerName: "Completed At",
    flex: 1,
    valueFormatter: ({ value }) => formatLocalTime(value as string),
  },
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
    <div className="flex flex-col h-full p-6">
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
