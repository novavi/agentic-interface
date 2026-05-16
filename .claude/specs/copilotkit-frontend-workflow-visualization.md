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

## Phase 2 — Code Cleanup

### Overview

Four targeted improvements to code organisation, visibility, and maintainability. No new user-facing features beyond the Run ID / Status visibility change in R2.

---

### R1 — Centralise agent config into a shared file

#### Problem

The graphId → LangGraph deployment URL mapping currently exists in two separate route files:

- `frontend/app/api/copilotkit/route.ts` — uses `process.env.LANGGRAPH_AGENT_CONVO_URL` / `LANGGRAPH_AGENT_AUTO_URL` inline in each `LangGraphAgent` constructor
- `frontend/app/api/agents/[graphId]/graph/route.ts` — duplicates the same mapping in a local `DEPLOYMENT_URLS` constant

Any change to an agent URL or the addition of a new agent must be made in both files.

#### Proposed solution

Create `frontend/config/<name>.ts` containing a single exported constant that maps each `graphId` to its LangGraph deployment URL. Both route files import from it.

The file will also hold any other agent-wide constants (see R3).

**This file is server-side only** — it reads `process.env` values that are not prefixed with `NEXT_PUBLIC_` and will resolve to `undefined` if imported into a client component. It should only be imported from route handlers and other server-side code.

#### Decision

File: `frontend/config/backend-config.ts` — constant: `AGENT_CONFIG` (array of `AgentConfigEntry` objects)

The constant uses an array structure rather than `Record<string, string>`, enabling both iteration (for building the `CopilotRuntime` agents object) and `.find()` lookup (for the graph route handler). Each entry has `graphId`, `url` (server-side), and `isWorkflowGraph: boolean` (distinguishes workflow-capable agents from the conversational agent). Workflow agents additionally carry `displayName` and `triggerMessage` (optional fields, client-safe).

`frontend/app/api/copilotkit/route.ts` builds its `agents` object via a single `Object.fromEntries(AGENT_CONFIG.map(...))` loop, replacing the previous repetitive manual block. A comment directly above the `CopilotRuntime` constructor shows the equivalent expanded form to aid readability.

`frontend/app/api/agents/[graphId]/graph/route.ts` uses `AGENT_CONFIG.find(a => a.graphId === graphId)` (result named `agentConfig`) for the URL lookup, replacing the previous `Record` index access.

---

#### R1b — Consolidate autonomous-agent-graphs.json into AGENT_CONFIG

`frontend/data/autonomous-agent-graphs.json` (subsequently moved to `frontend/config/`) held `graphId`, `name` (display name), and `triggerMessage` for the two autonomous workflow agents. These fields are now absorbed as `displayName` and `triggerMessage` optional fields on the relevant `AGENT_CONFIG` entries, making the JSON file entirely redundant.

**Changes:**
- `isWorkflowGraph: boolean` and optional `displayName` / `triggerMessage` added to `AgentConfigEntry`; set on all three entries in `AGENT_CONFIG` (`agent_convo_basic` has `isWorkflowGraph: false` and no display/trigger fields)
- `frontend/config/autonomous-agent-graphs.json` deleted
- `frontend/components/Workflow.tsx` import updated: JSON import removed, replaced with `AGENT_CONFIG` from `backend-config.ts`; `AutonomousWorkflowGraph` interface removed; `workflowAgents = AGENT_CONFIG.filter((a) => a.isWorkflowGraph)` replaces the previous `graphs` array; `g.name` references updated to `a.displayName`; `triggerMessage` accessed with `!` non-null assertion
- `frontend/data/` folder deleted (was already empty after the earlier move)

---

### R2 — Move Run ID and Status display to Workflow.tsx

#### Problem

Run ID and Status are currently inside `WorkflowRawView.tsx`, so they disappear when the user switches to the Graph tab.

#### Change

Move the Run ID and Status lines from `WorkflowRawView.tsx` into `Workflow.tsx`, placed between the tab switcher and the tab content area. They are rendered unconditionally regardless of active tab — but are only visible when a `currentThreadId` exists (same guard as before).

`WorkflowRawView.tsx` retains only the Messages and State sections.

---

### R3 — Move Next.js API URL template to config file

#### Problem

The URL template string `` `/api/agents/${graphId}/graph` `` is hardcoded 100+ lines deep inside `WorkflowVisualizer.tsx`. As the number of API calls grows, scattering URL strings across components makes them hard to find and update.

#### Change

Add an exported helper to the config file created in R1:

```typescript
export const getAgentGraphUrl = (graphId: string) =>
  `/api/agents/${graphId}/graph`;
```

`WorkflowVisualizer.tsx` imports and calls `getAgentGraphUrl(graphId)` instead of constructing the string inline. This is a client-safe export (no env vars, just string interpolation).

---

### R4 — Log request messages to the terminal for POST /api/copilotkit

#### Problem

When a workflow is triggered, the only terminal output is:

```
POST /api/copilotkit 200 in 18.0s
```

There is no visibility into what message triggered the run, making it harder to trace which workflow was started.

#### Change

In `frontend/app/api/copilotkit/route.ts`, clone the request before passing it to `handleRequest`, then log the messages array after the response is returned:

```typescript
export const POST = async (req: NextRequest) => {
  const cloned = req.clone();
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({ … });
  const response = await handleRequest(req);
  try {
    const body = await cloned.json();
    if (Array.isArray(body.messages) && body.messages.length > 0) {
      console.log(JSON.stringify(body.messages));
    }
  } catch {
    // body not parseable as JSON (e.g. Connect protocol framing) — skip
  }
  return response;
};
```

**Caveat**: CopilotKit v2 uses the Connect protocol (`application/connect+json`), which may prefix the body with a 5-byte binary frame header. If `cloned.json()` fails consistently, we will need to skip the first 5 bytes of the body (`ArrayBuffer` slice) and parse the remainder. This will be verified during implementation.

---

### Status

| Item | Status |
|------|--------|
| OQ1 (config file name) resolved | Resolved — `config/backend-config.ts` / `AGENT_CONFIG` |
| OQ2 (delete empty data/ folder) resolved | Resolved — yes, delete |
| R1 implementation | Complete |
| R2 implementation | Complete |
| R3 implementation | Complete |
| R4 implementation | Complete |

---

## Phase 3 — Live Execution Overlay

*(To be specified. Deferred from Phase 1.)*

Phase 3 will extend `WorkflowVisualizer` to reflect the running execution state: highlighting the currently active node, visually marking completed nodes, and animating the traversed edges in real time as the workflow executes via CopilotKit.
