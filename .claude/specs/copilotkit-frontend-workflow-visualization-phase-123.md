# Plan: CopilotKit-based Frontend — Workflow Visualization

> ## ⚠ IMPORTANT NOTE — THIS PLAN HAS BEEN SUPERSEDED
>
> This plan has been superseded by **[copilotkit-frontend-workflow-visualization-new-version.md](./copilotkit-frontend-workflow-visualization-new-version.md)**, which implements a replacement workflow visualization component from scratch.
>
> As part of that replacement, the implementation files produced by this plan have been retired and moved to the `scratch/` folder at the repo root (renamed with `.tsx.txt` so Next.js and TypeScript ignore them):
>
> - `frontend/components/Workflow.tsx` → `scratch/components/Workflow.tsx.txt`
> - `frontend/components/WorkflowVisualizer.tsx` → `scratch/components/WorkflowVisualizer.tsx.txt`
> - `frontend/app/debug-replay/page.tsx` → `scratch/app/debug-replay/page.tsx.txt`
> - `frontend/app/workflow/[[...slug]]/page.tsx` → `scratch/app/workflow/[[...slug]]/page.tsx.txt`
>
> Do not use this plan as a guide for further development. Refer to the new-version plan linked above.

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

The tab switcher will use the existing `Button` component (or minimal styled tab buttons) consistent with the dark theme in place. No new UI library component is needed. Both tab buttons carry `className="cursor-pointer"` so hovering shows the pointer hand cursor.

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

In `frontend/app/api/copilotkit/route.ts`, clone the request (as `reqClone`) before passing it to `handleRequest`, then pretty-print the full request body after the response is returned:

```typescript
export const POST = async (req: NextRequest) => {
  const reqClone = req.clone();
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({ … });
  const response = await handleRequest(req);
  try {
    const body = await reqClone.json();
    console.log(JSON.stringify(body, undefined, 2));
  } catch (err) {
    console.error("[copilotkit] failed to parse request body:", err);
  }
  return response;
};
```

**Body shape**: The Connect protocol body is valid JSON (not binary-framed as originally suspected). Each request has the shape `{ method, params: { agentId }, body: { threadId, messages, … } }`. Logging the full body is more useful than extracting `messages` alone.

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

### Overview

Extend `WorkflowVisualizer` to display live execution state when a workflow is running. Phase 3 is split into two sub-phases:

- **Phase 3a (R1–R5):** Wire up the streaming infrastructure; display raw stream events in a `<pre>` element while a run is in progress. Proves the end-to-end plumbing before any graph rendering work.
- **Phase 3b (R6):** Replace the raw event display with the existing ReactFlow graph plus a live node-status overlay. Deferred until Phase 3a is verified end-to-end.

---

### Architecture

```
Workflow.tsx
  → passes { graphId, currentThreadId, isRunning } to WorkflowVisualizer

WorkflowVisualizer.tsx
  → if currentThreadId !== null: streaming mode (Phase 3a: raw events; Phase 3b: graph overlay)
  → else: graph definition mode (existing Phase 1 behaviour)

Browser EventSource
  ← GET /api/agents/{graphId}/stream?threadId={threadId}    ← new Next.js SSE proxy route
       → @langchain/langgraph-sdk Client (server-side)
         → client.runs.list(threadId)       ← find the runId created by CopilotKit
         → client.runs.joinStream(threadId, runId, { streamMode: "updates" })
           → proxy events as SSE to browser
```

**Why `joinStream`, not `runs.stream`:** `Client.runs.stream()` creates a new run on the thread. We need to subscribe to the run CopilotKit already created. `Client.runs.joinStream(threadId, runId)` does exactly this — it streams events from an existing run without disturbing it. The `runId` is obtained by calling `client.runs.list(threadId)` after CopilotKit starts the run.

**Why a Next.js proxy route rather than calling the LangGraph server directly from the browser:** The LangGraph dev server URL is a server-side secret (env var without `NEXT_PUBLIC_`). Keeping the LangGraph connection on the server side preserves the existing security boundary.

---

### Packages Required

`@langchain/langgraph-sdk` v1.9.1 is already installed as a transitive dependency of `@langchain/langgraph` but is not listed in `package.json`. It should be added as an explicit direct dependency so it is not silently removed if the transitive dependency chain changes.

```bash
npm install @langchain/langgraph-sdk
```

---

### R1 — Preserve graph definition display when not running

No code change. The existing graph-definition mode continues to work. The new streaming mode only activates when `currentThreadId !== null`. Ensuring this condition is correct is the responsibility of the new `WorkflowVisualizer` mode-switch logic in R4.

---

### R2 — Evolve `WorkflowVisualizer` props

**Current interface:**
```typescript
interface WorkflowVisualizerProps {
  graphId: string;
}
```

**New interface:**
```typescript
interface WorkflowVisualizerProps {
  graphId: string;
  currentThreadId: string | null;
  isRunning: boolean;
}
```

`currentThreadId` is the primary mode switch: non-null → streaming mode, null → graph definition mode.

`isRunning` is passed for display purposes (e.g., showing a "live" indicator while the run is in progress vs. showing a "completed" indicator after it ends) but does not control the SSE connection lifecycle — the SSE stream closing naturally signals run completion.

**`Workflow.tsx` change:** Pass the new props:
```tsx
<WorkflowVisualizer
  graphId={selectedGraphId}
  currentThreadId={currentThreadId}
  isRunning={agent.isRunning}
/>
```

---

### R3 — New SSE proxy route: GET /api/agents/[graphId]/stream

**File:** `frontend/app/api/agents/[graphId]/stream/route.ts`

No `export const dynamic` needed — Next.js route handlers are not cached by default (confirmed from Next.js docs; `force-dynamic` is not a documented value and is unnecessary here).

**Query parameter:** `threadId` (required string).

**Logic:**

1. Resolve `graphId` via `AGENT_CONFIG` — return 400 if unknown.
2. Read `threadId` from `req.nextUrl.searchParams` — return 400 if absent.
3. Construct `Client({ apiUrl: agentConfig.url, apiKey: null })` from `@langchain/langgraph-sdk`. Passing `apiKey: null` disables the automatic env-var API-key lookup; no key is required for a local `langgraph dev` server.
4. **Find the run (race-condition window):** LangGraph creates the run in response to CopilotKit's request, which arrives in parallel with our SSE connection. The SSE connection from the browser may arrive before the run exists. Retry `client.runs.list(threadId, { limit: 1 })` up to 10 times with 100 ms delay (≤ 1 s total). Take `runs[0]` — any run on the thread regardless of status (since every `currentThreadId` is a fresh UUID, there is at most one run). If no run is found after all retries, return 404.
5. Open `client.runs.joinStream(threadId, runId, { streamMode: "updates", cancelOnDisconnect: false, signal: req.signal })`. `cancelOnDisconnect: false` because CopilotKit is managing the run independently — a browser disconnect from the proxy should not cancel the run. `signal: req.signal` stops the proxy from forwarding events when the browser disconnects, without affecting the run itself.
6. Proxy the async generator as SSE. Each chunk is formatted as `data: {json}\n\n`. Send a synthetic terminal event `data: {"event":"stream_end"}\n\n` after the generator closes, then close the `ReadableStream` controller. This terminal event lets the browser side close the `EventSource` cleanly rather than triggering auto-reconnect.
7. Return `new Response(readableStream, { headers })` with `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.

**Config helper (analogous to `getAgentGraphUrl`):** Add to `frontend/config/backend-config.ts`:
```typescript
export const getAgentStreamUrl = (graphId: string, threadId: string) =>
  `/api/agents/${graphId}/stream?threadId=${encodeURIComponent(threadId)}`;
```

---

### R4 — `WorkflowVisualizer` mode-switch logic

```
useEffect on currentThreadId:
  if null → no-op (component stays in graph definition mode)
  if non-null:
    open EventSource pointing to getAgentStreamUrl(graphId, currentThreadId)
    on message → accumulate parsed events into state
    on "stream_end" event → close EventSource, set connection state = "closed"
    on error (unexpected disconnect) → set connection state = "error"
  cleanup:
    close EventSource if open
```

Connection state is tracked as `"open" | "closed" | "error" | null` (null = no thread, graph definition shown). The three non-null states drive the badge:
- `"open"` — `● Live` in green; stream active
- `"closed"` — `✓ Complete` in grey; run finished normally
- `"error"` — `✗ Error` in red; unexpected stream failure

The `EventSource` is closed explicitly on the `"stream_end"` event because the browser's `EventSource` implementation auto-reconnects after a server-side close. Sending an explicit terminal event and calling `es.close()` prevents spurious reconnect attempts after a run completes normally.

---

### R5 — Raw stream events display (Phase 3a content)

When `currentThreadId !== null`, render a dark scrollable `<pre>` block in place of the ReactFlow canvas. Behaviour:

- Auto-scrolls to the bottom as new events arrive.
- Each event rendered as pretty-printed JSON (`JSON.stringify(event, null, 2)`), separated by blank lines.
- Header line shows connection state badge driven by `connectionState`, not `isRunning`: `● Live` (green, `connectionState === "open"`), `✓ Complete` (grey, `"closed"`), `✗ Error` (red, `"error"`).
- Placeholder text while waiting for the first event: `"Waiting for stream…"`.
- Retains all events after the run completes (does not auto-clear) until the user switches graph or starts a new run (either action sets `currentThreadId = null` which clears event state and returns to graph definition mode).

---

### R6 — ReactFlow live overlay (Phase 3b — deferred)

*Deferred until R1–R5 are verified end-to-end.*

Replace the `<pre>` event display with the existing ReactFlow graph (Phase 1 layout, unchanged) plus per-node status colour overlay. Node state is derived from the `"updates"` stream events received in R4–R5:

- Each `updates` event has shape `{ event: "updates", data: { [nodeName]: stateUpdate } }`. Every key is a node that just completed a step.
- A second stream mode `"checkpoints"` (added alongside `"updates"`) provides `next: string[]` on each checkpoint event, indicating which nodes are queued to run next. This gives the "active" (about-to-run) state without needing task-level events.

Node visual states:
- **Pending** (not yet seen in any event) — default React Flow node style
- **Active** (appeared in a checkpoint `next` array but not yet in an `updates` event) — amber/yellow highlight
- **Completed** (appeared in an `updates` event) — green highlight
- **Error** (if the stream closes with an error and the node was active) — red highlight

Implementation approach:
- Add `streamMode: ["updates", "checkpoints"]` to the `joinStream` call in the SSE route (replaces `"updates"` only).
- Track `completedNodes: Set<string>` and `activeNodes: Set<string>` as state derived from the accumulated events.
- Use ReactFlow custom node types to support per-node background colour. The existing `"input"` / `"output"` / `"default"` built-in types do not support arbitrary background colours; a thin custom wrapper is needed.
- The graph definition fetch (existing Phase 1 code) still runs on mount to supply node positions. The live status overlay is an additive layer on top.

---

### Open Questions

**OQ1 — Phase 4 scope (resolved):** Phase 4 will cover watching a run that was triggered in a previous session. `joinStream` is agnostic to run age — it replays historical events for completed runs and delivers live events for runs still in progress. The Phase 3 streaming infrastructure is therefore fully reusable for Phase 4. The only Phase 4 work is the storage layer in `Workflow.tsx`: write `{ graphId, threadId }` to `localStorage` when a run starts, restore on mount, clear on graph-change. Estimated ~10–20 lines. No new routes or SDK usage required.

**OQ2 — Post-completion behaviour (resolved):** Sticky view confirmed. Stream events are retained after the run completes and the visualizer stays in streaming mode. The view resets to graph definition only when the user changes the selected graph or starts a new run (both set `currentThreadId = null`).

**OQ3 — `streamMode` staging (resolved):** `streamMode: "updates"` only for Phase 3a. `"checkpoints"` is added alongside `"updates"` in Phase 3b when the active-node highlight requires it. The SSE route change at that point is a one-line addition to the `joinStream` call.

---

### Files to Create / Modify

| File | Action |
|------|--------|
| `frontend/app/api/agents/[graphId]/stream/route.ts` | Create — SSE proxy route |
| `frontend/components/WorkflowVisualizer.tsx` | Modify — add streaming mode (R2, R4, R5) |
| `frontend/components/Workflow.tsx` | Modify — pass `currentThreadId`, `isRunning` to WorkflowVisualizer (R2) |
| `frontend/config/backend-config.ts` | Modify — add `getAgentStreamUrl` helper (R3) |

---

### Decisions

**D1 — `Client.runs.joinStream` over `RemoteGraph.streamEvents`:** `RemoteGraph.streamEvents()` creates a new run. `Client.runs.joinStream()` attaches to an existing run. Since CopilotKit creates the run, we must join it rather than start a second one.

**D2 — EventSource with explicit terminal event:** The browser `EventSource` auto-reconnects after a server-side close. We prevent this by sending a `stream_end` sentinel event and calling `es.close()` in the client handler, rather than relying on the connection closing cleanly.

**D3 — Run discovery via `runs.list` with retry:** Since every `currentThreadId` is a fresh UUID per run, `client.runs.list(threadId)` returns at most one run. The retry loop (up to 1 s) covers the race window between CopilotKit creating the run and our SSE route querying for it.

**D4 — `currentThreadId` as mode switch, `connectionState` as display driver:** `currentThreadId` being non-null is sufficient to enter streaming mode. The badge (`● Live` / `✓ Complete` / `✗ Error`) is driven by `connectionState` derived from the SSE stream lifecycle, not by `isRunning`. `isRunning` is accepted as a prop for interface completeness and future use in Phase 3b but is not used in Phase 3a display logic.

---

### Status

| Item | Status |
|------|--------|
| OQ1 (Phase 4 scope) | Resolved — localStorage persistence; no new routes needed |
| OQ2 (post-completion behaviour) | Resolved — sticky view confirmed |
| OQ3 (streamMode staging) | Resolved — "updates" only in Phase 3a, add "checkpoints" in Phase 3b |
| Phase 3a investigation | Complete |
| D1–D4 | Resolved |
| R1–R5 implementation | Complete |
| R6 implementation | Not started (deferred) |

---

## Phase 3c — R5 Replay Fixes

### Overview

Two bugs prevent completed workflow runs from being visible after a browser refresh or tab switch. Both bugs exist in the current Phase 3a code and must be fixed before Phase 3b work begins, since Phase 3b builds on top of this streaming infrastructure.

**Bug 1 — Raw view:** After a browser refresh (or navigating away and back), `WorkflowRawView` shows "No workflow started yet." for a completed run even though the `threadId` is in the URL. Root cause: `agent.threadId` is never set from the URL's `threadId` on restore — it is only set inside `handleStartWorkflow`. CopilotKit therefore never associates the agent with the existing thread and does not replay messages or state.

**Bug 2 — Graph view:** After switching from the Graph tab to the Raw tab and back, `WorkflowVisualizer` shows "Waiting for stream…" instead of the completed run's events. Root cause: `streamEvents` is local state inside `WorkflowVisualizer`; switching to the Raw tab unmounts the component and discards all accumulated events. On remount, the SSE route calls `joinStream` which replays stored update events from the in-memory checkpointer — but the events are re-fetched from scratch every time the component remounts.

**Checkpointer context:** All three agents (`agent_convo_basic`, `agent_auto_ex_1`, `agent_auto_ex_2`) compile their graphs without an explicit checkpointer. `langgraph dev` automatically injects an in-memory `MemorySaver` at runtime, so thread state is available within the same server session. Both fixes rely on this in-memory state being present; neither fix survives a `langgraph dev` restart (same limitation applies today to conversation history replay).

---

### R5c-1 — Raw view: connect agent to existing thread on restore

**File:** `frontend/components/Workflow.tsx`

**Root cause:** `agent.threadId` is only set at line 88 inside `handleStartWorkflow`. When the component loads from a URL containing a `threadId` (browser refresh or direct navigation), `currentThreadId` is correctly restored from `threadIdProp`, but `agent.threadId` is never set, so CopilotKit has no thread context and `agent.messages` / `agent.state` remain empty.

**Fix:** Add a `useEffect` in `Workflow.tsx` that watches `currentThreadId` and — when restoring a completed thread — sets `agent.threadId` and calls `copilotkit.connectAgent({ agent })`:

```tsx
useEffect(() => {
  if (!currentThreadId) return;

  // Only call connectAgent for terminal runs. For "running" runs, copilotkit.runAgent()
  // is already in flight (set before setCurrentThreadId in handleStartWorkflow); calling
  // connectAgent in parallel would conflict. For absent entries, there is nothing to restore.
  try {
    const entries: WorkflowEntry[] = JSON.parse(sessionStorage.getItem(WORKFLOWS_KEY) ?? "[]");
    const entry = entries.find((w) => w.threadId === currentThreadId);
    if (!entry || entry.status === "running") return;
  } catch {
    return;
  }

  agent.threadId = currentThreadId;
  copilotkit.connectAgent({ agent });
}, [currentThreadId]); // agent and copilotkit are stable references; omitting from deps is intentional
```

**How this works:** `copilotkit.connectAgent({ agent })` is the CopilotKit v2 method used internally by `CopilotChat` to load thread history. When called, it replays all stored messages and state updates from the thread into the agent object, causing `agent.messages` and `agent.state` to populate exactly as they would for a live run. This is confirmed by the CopilotChat source, which executes the same two-step sequence: `agent.threadId = resolvedThreadId` then `await copilotkit.connectAgent({ agent })`.

**Guard logic:** In `handleStartWorkflow`, the session storage entry with `status: "running"` is written before `setCurrentThreadId(newThreadId)` is called. React state updates are asynchronous — the new `currentThreadId` value only lands in the next render, at which point the useEffect fires. By then, session storage already has `status: "running"` for the new thread, so the guard correctly skips `connectAgent` for fresh runs.

---

### R5c-2 — Graph view: prevent streamEvents loss on tab switch

**File:** `frontend/components/Workflow.tsx`

**Root cause:** In `Workflow.tsx`, the tab content is rendered conditionally:

```tsx
{activeTab === "graph" ? (
  <WorkflowVisualizer ... />
) : (
  <WorkflowRawView ... />
)}
```

Switching to the Raw tab unmounts `WorkflowVisualizer`, discarding its local `streamEvents` and `connectionState` state. When the user switches back to the Graph tab, the component remounts, opens a fresh SSE connection, and `joinStream` replays the stored update events from the in-memory checkpointer — but this re-fetch is unnecessary overhead, and the UI shows "Waiting for stream…" until the first replayed event arrives.

**Fix:** Replace the conditional rendering with CSS-based visibility — both components are always mounted; only one is visible at a time:

```tsx
<div className={activeTab === "graph" ? "flex-1 min-h-0 px-6 pb-6" : "hidden"}>
  <WorkflowVisualizer ... />
</div>
<div className={activeTab === "raw" ? "flex-1 min-h-0 px-6 pb-6 overflow-auto" : "hidden"}>
  <WorkflowRawView ... />
</div>
```

This preserves all component state across tab switches at the cost of keeping both components mounted. `WorkflowRawView` is cheap (no SSE connection, just renders agent state). `WorkflowVisualizer` already manages an SSE connection and is the more expensive component; it benefits most from staying mounted.

**Refresh path:** On browser refresh with a `threadId` in the URL, `WorkflowVisualizer` mounts once, opens an SSE connection to the stream proxy, and `joinStream` replays the run's stored update events from the in-memory checkpointer. This path is unchanged by this fix and should already work within the same `langgraph dev` session — the fix only addresses the tab-switch case.

---

### Files to Modify

| File | Action |
|------|--------|
| `frontend/components/Workflow.tsx` | Add `connectAgent` restore effect (R5c-1); replace conditional rendering with CSS hidden (R5c-2) |

No other files require changes. The SSE route, `WorkflowVisualizer`, and `WorkflowRawView` are unchanged.

---

### Status

| Item | Status |
|------|--------|
| Investigation | Complete |
| R5c-1 implementation | Complete |
| R5c-2 implementation | Complete |
