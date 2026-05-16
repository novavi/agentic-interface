# Plan: CopilotKit-based Frontend — Workflow Visualization

## Overview

Extend the Workflow view to display a visual React Flow graph of the selected agent workflow. The user can toggle between a graph visualization and the existing raw message/state display. Phase 1 focuses entirely on the static graph definition (shape, nodes, directed edges, conditional branches). Live execution state overlay — highlighting the active node as a workflow runs — is deferred to Phase 2.

---

## Phase 1 — Visualize Graph Definition

### Architecture

```
frontend/components/Workflow.tsx                           ← existing; gains tab switcher, passes props down
frontend/components/WorkflowRawView.tsx                    ← new; existing message/state display extracted from Workflow.tsx
frontend/components/WorkflowVisualizer.tsx                 ← new; React Flow graph rendering component
frontend/app/api/agents/[graphId]/graph/route.ts           ← new; fetches graph structure from LangGraph server
```

Data flow for `WorkflowVisualizer`:

```
Workflow.tsx (selectedGraphId changes)
  → WorkflowVisualizer.tsx (fetches on prop change)
    → GET /api/agents/{graphId}/graph
      → new RemoteGraph({ graphId, url }) from @langchain/langgraph/remote
        → .getGraphAsync({ xray: false })
          → calls LangGraph dev server internally
            → returns { nodes, edges }
    → transforms nodes/edges to React Flow format (with dagre auto-layout)
    → renders <ReactFlow nodes={...} edges={...} />
```

---

### R1 — Refactor Workflow.tsx: extract raw display into WorkflowRawView.tsx

#### Current state of Workflow.tsx

The component currently handles two concerns:

1. **Workflow control** — graph selector dropdown, Start Workflow button, `useAgent` / `useCopilotKit` hooks, agent state management
2. **Raw display** — Run ID, Status label, Messages section, State JSON section

#### Change

Extract concern 2 into `frontend/components/WorkflowRawView.tsx`.

**WorkflowRawView.tsx** props:

```typescript
interface WorkflowRawViewProps {
  agent: ReturnType<typeof useAgent>["agent"];
  currentThreadId: string | null;
}
```

The component receives `agent` and `currentThreadId` from `Workflow.tsx` via props and contains the existing Run ID, Status, Messages, and State JSX — moved verbatim, no logic changes.

**Workflow.tsx after R1:**
- Retains: `useAgent`, `useCopilotKit`, `selectedGraphId`, `currentThreadId` state, graph selector, Start Workflow button
- Gains: tab switcher UI (see UI Layout section below)
- Passes `{ agent, currentThreadId }` to `WorkflowRawView` when Raw tab is active
- Passes `{ graphId: selectedGraphId }` to `WorkflowVisualizer` when Graph tab is active

No behaviour changes — R1 is a pure structural refactor.

---

### R2 — New WorkflowVisualizer.tsx

A React Flow component that renders the static graph definition of the selected workflow.

**Props:**

```typescript
interface WorkflowVisualizerProps {
  graphId: string;
}
```

**Behaviour:**

- Fetches `GET /api/agents/{graphId}/graph` on mount and when `graphId` changes (user switches workflow in the dropdown)
- Applies automatic top-to-bottom DAG layout via `@dagrejs/dagre` to assign `(x, y)` positions to each node
- Renders a directed graph using `<ReactFlow>` with:
  - Each node labelled with its function name (e.g. `router_node`, `step_1_node`)
  - `__start__` and `__end__` nodes visually distinguished (e.g. rounded pill shape, distinct colour)
  - Directed edges with arrowheads indicating flow direction
  - Conditional edges visually distinguished — dashed style and/or labelled with the branch condition
- Loading state: spinner/skeleton while fetching
- Error state: inline message if fetch fails (e.g. LangGraph server unreachable)

**Phase 1 scope:**

- Does NOT reflect running execution state — no node highlighting, no active-edge animation. That is Phase 2.
- The graph display is identical whether or not a workflow is currently running.

**React Flow setup notes:**

- `@xyflow/react/dist/style.css` must be imported once globally — add to `frontend/app/layout.tsx`
- The `<ReactFlow>` canvas requires a parent container with explicit dimensions; `WorkflowVisualizer` will render into a `div` that fills its parent (flex `flex-1 min-h-0`)

---

### R3 — New API route: GET /api/agents/[graphId]/graph

**File:** `frontend/app/api/agents/[graphId]/graph/route.ts`

A Next.js App Router dynamic route handler. The `graphId` path segment maps to the LangGraph graph name.

**Responsibilities:**

1. Derive the LangGraph deployment URL from env vars, following the same pattern as `app/api/copilotkit/route.ts`:
   - `agent_auto_ex_1` / `agent_auto_ex_2` → `LANGGRAPH_AGENT_AUTO_URL` (fallback `http://localhost:2025`)
   - `agent_convo_basic` → `LANGGRAPH_AGENT_CONVO_URL` (fallback `http://localhost:2024`)
   - Unknown `graphId` → return HTTP 400
2. Instantiate `RemoteGraph` from `@langchain/langgraph/remote` and call `getGraphAsync({ xray: false })`
3. Return the graph JSON to the frontend with a 200 status, or an appropriate error status if the upstream call fails

**Fetch implementation:**

```typescript
import { RemoteGraph } from "@langchain/langgraph/remote";

const remoteGraph = new RemoteGraph({ graphId, url: deploymentUrl });
const graph = await remoteGraph.getGraphAsync({ xray: false });
return Response.json(graph);
```

No LangSmith API key is required for a local `langgraph dev` server.

**Response shape** (returned to `WorkflowVisualizer`):

```typescript
interface GraphResponse {
  nodes: Array<{
    id: string;
    data: { name: string; type?: string };
  }>;
  edges: Array<{
    source: string;
    target: string;
    data?: { conditional?: boolean; label?: string };
  }>;
}
```

This is the shape `RemoteGraph.getGraphAsync()` returns from the LangGraph server.

**Error handling:**
- `graphId` not recognised → `400 Bad Request`
- Upstream LangGraph server unreachable or error → `502 Bad Gateway` with message forwarded

---

### Packages Required

All packages are frontend dependencies. Per project convention, the exact install commands are provided for the user to run — not executed by the assistant.

```bash
npm install @xyflow/react @dagrejs/dagre @langchain/langgraph
```

| Package | Purpose |
|---------|---------|
| `@xyflow/react` | React Flow v12+ — graph canvas, nodes, edges, controls, pan/zoom |
| `@dagrejs/dagre` | Automatic directed-graph layout — computes `(x, y)` positions for each node; ships its own TypeScript declarations (no `@types` package needed). React Flow handles rendering only; it requires explicit positions on every node and has no built-in layout algorithm. Dagre fills that gap using the Sugiyama hierarchical layout, which produces a clean top-to-bottom DAG arrangement. |
| `@langchain/langgraph` | Provides `RemoteGraph` from `@langchain/langgraph/remote` — the official LangGraph client for fetching graph structure from a deployed server. Used only in the server-side API route; not bundled to the client. |

---

### UI Layout Design

The Workflow panel keeps the workflow selector and Start Workflow button at the top. Immediately below them, two tabs toggle between views:

```
[ Example 1 Workflow ▼ ]  [ Start Workflow ]

[ Graph ]  [ Raw ]
┌─────────────────────────────────────────────┐
│                                             │
│  (tab content — React Flow or raw view)     │
│                                             │
└─────────────────────────────────────────────┘
```

- **Graph tab** (default): renders `WorkflowVisualizer` for the currently selected workflow. Visible at all times, including before any workflow has been started.
- **Raw tab**: renders `WorkflowRawView` (Run ID, Status, Messages, State). Content is meaningful only after a workflow has been triggered; an empty-state message is shown before the first run.

The tab switcher will use the existing `Button` component (or minimal styled tab buttons) consistent with the dark theme in place. No new UI library component is needed.

---

### Decisions

#### D1 — Method for fetching graph data

Use `RemoteGraph.getGraphAsync({ xray: false })` from `@langchain/langgraph/remote`. This is the official LangGraph JS SDK method, confirmed to exist and to work against a local `langgraph dev` server. It abstracts the underlying REST API contract — if LangGraph changes endpoint paths in a future release, the SDK handles it. Requires adding `@langchain/langgraph` as a frontend dependency (server-side only).

#### D2 — xray parameter

In LangGraph, a node can itself be a compiled `StateGraph` (a "subgraph"). When `xray=true`, `getGraphAsync` recursively expands those nodes to expose their internal structure. Both workflows in this POC use only plain Python function nodes — no subgraphs — so `xray` has no effect either way. Defaulting to `xray=false`.

#### D3 — Node layout engine

`@dagrejs/dagre` — the maintained fork of the `dagre` directed-graph layout library. React Flow is a rendering library only: it draws nodes and edges at positions you supply, but has no built-in algorithm to compute those positions. Dagre solves that: given nodes and edges, it runs the Sugiyama hierarchical layout algorithm and returns clean `(x, y)` coordinates. Those coordinates are then passed to React Flow node objects before rendering. React Flow's own documentation examples use `@dagrejs/dagre` for this purpose.

---

### Files to Create / Modify

| File | Action |
|------|--------|
| `frontend/components/WorkflowRawView.tsx` | Create — display logic extracted from Workflow.tsx |
| `frontend/components/WorkflowVisualizer.tsx` | Create — React Flow graph rendering |
| `frontend/app/api/agents/[graphId]/graph/route.ts` | Create — graph structure API route |
| `frontend/components/Workflow.tsx` | Modify — add tab switcher, delegate display to child components |
| `frontend/app/layout.tsx` | Modify — add `@xyflow/react/dist/style.css` import |

---

### Files Not Changed

| File | Reason |
|------|--------|
| `frontend/app/page.tsx` | Workflow is still one top-level view |
| `frontend/components/Navbar.tsx` | No new top-level views added |
| `frontend/data/autonomous-agent-graphs.json` | No new fields needed; deployment URLs derived from env vars |
| `frontend/app/api/copilotkit/route.ts` | Agent runtime unaffected |
| `frontend/components/Conversation.tsx` | Unrelated to this feature |

---

### Status

| Item | Status |
|------|--------|
| Phase 1 investigation | Complete |
| D1 (fetch method) | Resolved — `RemoteGraph.getGraphAsync` |
| D2 (xray) | Resolved — `xray=false` |
| D3 (layout engine) | Resolved — `@dagrejs/dagre` |
| R1 implementation | Complete |
| R2 implementation | Complete |
| R3 implementation | Complete |

---

## Phase 2 — Live Execution Overlay

*(To be specified. Deferred from Phase 1.)*

Phase 2 will extend `WorkflowVisualizer` to reflect the running execution state: highlighting the currently active node, visually marking completed nodes, and animating the traversed edges in real time as the workflow executes via CopilotKit.
