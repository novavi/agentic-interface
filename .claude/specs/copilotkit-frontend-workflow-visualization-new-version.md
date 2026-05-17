# Plan: CopilotKit-based Frontend — Workflow Visualization — New Version

## Overview

After extended iteration on `Workflow.tsx` failed to produce a component that live-updates messages and state during an active workflow run, we established a new baseline by recovering the last known working version of the Workflow component from Git history. That version was committed to `NextGenWorkflow.tsx` and exposed under a separate nav item ("Run Workflow V2") so it could be tested and iterated on independently without disturbing the existing `Workflow.tsx`.

The overall goal is to build a correct, working Workflow component that:
- Live-updates messages and state in real time as the workflow runs
- Avoids the over-complicated inner/outer component split and key-based remounting that caused the live-update regression
- Is clean and maintainable

**Key architectural insight (learned the hard way):** `useAgent` must live in the same component that renders agent data. Its internal `forceUpdate` re-renders the component that called the hook — not its children. Splitting into parent/child components and passing `agent.messages` / `agent.state` as props breaks live updates regardless of how the data is threaded through. `runAgent` must also be `await`ed in an event handler (not fire-and-forget in a `useEffect`) to match the pattern the CopilotKit subscription mechanism is designed around.

---

## Requirements and Changes

### R1 — Establish baseline from Git history

Created `components/NextGenWorkflow.tsx` based on the last known working version of the Workflow component recovered from Git history. This version successfully handles real-time live updates of messages and state during a workflow run.

Added a new page `app/workflow-v2/page.tsx` rendering this component, and a new "Run Workflow V2" nav item in `components/Navbar.tsx` pointing to `/workflow-v2`. This allows iterative development and testing without affecting the existing `/workflow` route.

**Files changed:** `components/NextGenWorkflow.tsx` (created), `app/workflow-v2/page.tsx` (created), `components/Navbar.tsx`

---

### R2 — Point to correct agent ID

Updated the hardcoded agent ID from the stale `agent_auto_example` fallback to `agent_auto_ex_1`, matching the agent registered in the current backend runtime.

**Files changed:** `components/NextGenWorkflow.tsx`

---

### R3 — Add graph selector

Added a `selectedGraphId` state (defaulting to the first workflow agent from `AGENT_CONFIG`) and replaced the hardcoded `AGENT_ID` constant. Added the same select dropdown used in `Workflow.tsx` (with `ChevronDown` icon) to let the user choose which workflow agent/graph to run.

Updated `handleStartWorkflow` to resolve the `triggerMessage` from the selected agent's config, replacing the hardcoded `"start workflow"` string.

**Files changed:** `components/NextGenWorkflow.tsx`

---

### R5 — Rename component to `NextGenWorkflow`

Renamed the exported component function from `Workflow` to `NextGenWorkflow` in `components/NextGenWorkflow.tsx` to eliminate any ambiguity with the existing `Workflow` component in `Workflow.tsx`. Updated the import and JSX reference in `app/workflow-v2/page.tsx` accordingly.

**Files changed:** `components/NextGenWorkflow.tsx`, `app/workflow-v2/page.tsx`

---

### R4 — Reset state and threadId on graph change and on new run

**On graph change:** added `handleGraphChange` which clears the current agent's messages and state (`agent.setState({})`, `agent.setMessages([])`), switches `selectedGraphId`, and resets `currentThreadId` to `null`. This ensures no stale data from a previous run on that agent persists when the user switches graphs.

**On Start Workflow:** added the same agent clear (`agent.setState({})`, `agent.setMessages([])`) plus a `setCurrentThreadId(null)` before assigning the new thread ID. This guarantees a clean slate before every new run regardless of whether a previous run was completed.

**Files changed:** `components/NextGenWorkflow.tsx`

---

### R6 — Session storage tracking and status display

Added `WORKFLOWS_KEY`, `WorkflowEntry`, and `STATUS_LABELS` constants. On Start Workflow, a `"running"` entry is written to session storage before `runAgent` is called. On successful completion the entry is updated to `"complete"`; on error it is set to `"error"`.

Added a status line below the Run ID line (same `font-mono text-xs text-gray-400` style) that reads `agent.state.status`, maps it through `STATUS_LABELS`, and falls back to the raw value for any status string not in the map.

**Files changed:** `components/NextGenWorkflow.tsx`

---

### R7 — Routing

Moved `app/workflow-v2/page.tsx` to `app/workflow-v2/[[...slug]]/page.tsx` (optional catch-all), mirroring the `/workflow` route. The page extracts `slug?.[0]` as `threadId` and passes it as a prop to `NextGenWorkflow`.

`NextGenWorkflow` now accepts `threadId: string | null`. Three `useEffect` hooks handle URL-driven behaviour:

1. **URL sync** (`[threadIdProp]`): keeps `currentThreadId` in sync with browser back/forward navigation.
2. **Graph restore** (`[threadIdProp]`): when the page loads with a threadId, looks up the corresponding `graphId` in session storage and restores the selector — ensuring `useAgent` returns the correct agent before connecting.
3. **View mode** (`[agent, threadIdProp, isWorkflowRunning]`): when a `threadId` is present in the URL and no run is active, calls `copilotkit.connectAgent` to replay or resume the thread. A `viewConnectedRef` prevents redundant calls; its cleanup resets to `null` so that an agent change (triggered by the graph restore above) causes a reconnect with the correct agent. Shows "Connecting…" spinner while in progress.

On Start Workflow: `window.history.pushState(null, '', \`/workflow-v2/${newThreadId}\`)` updates the URL bar without triggering a React/Next.js re-render, and `viewConnectedRef.current = newThreadId` prevents the view-mode effect from interfering with the live run.

On graph change: `router.push("/workflow-v2")` clears the URL threadId and `viewConnectedRef.current` is reset.

The Start Workflow button and graph selector are disabled while `isWorkflowRunning` is true.

**Files changed:** `components/NextGenWorkflow.tsx`, `app/workflow-v2/[[...slug]]/page.tsx` (created), `app/workflow-v2/page.tsx` (removed)

**Regression fix:** The initial R7 implementation used `router.push(\`/workflow-v2/${newThreadId}\`)` inside `handleStartWorkflow`. This triggered a Next.js App Router navigation (server component re-render via Suspense/startTransition) that disrupted the `useAgent` subscription during the active run — causing the status label to show no value and all live updates to stop. The backend run still completed (session storage was correctly updated), confirming only the React-side subscription was broken.

Fixed by replacing `router.push` with `window.history.pushState(null, '', \`/workflow-v2/${newThreadId}\`)` in `handleStartWorkflow` only. This updates the URL bar without any React/Next.js re-render, keeping the component stable and the `useAgent` subscription active throughout the run. `handleGraphChange` retains `router.push("/workflow-v2")` since no run is active at that point.

---

### R8 — Static graph visualizer (left panel)

Added a two-panel layout: static graph definition on the left, messages and state on the right.

Inlined the minimal graph helpers from the earlier `WorkflowVisualizer.tsx` directly into `NextGenWorkflow.tsx` — no new component file, no cross-component prop passing. This preserves the architectural constraint that all agent state and rendering stays in a single component.

Added: `NODE_WIDTH`/`NODE_HEIGHT` constants, `LangGraphEdge`/`GraphResponse` interfaces, `formatNodeLabel`, `applyDagreLayout`, `toReactFlow` helper functions, `useNodesState`/`useEdgesState` state, and `graphLoading`/`graphError` state.

A single `useEffect` keyed on `[selectedGraphId]` fetches the static graph definition from `getAgentGraphUrl(selectedGraphId)` and populates nodes and edges via `toReactFlow`. The graph re-fetches automatically when the user changes the graph selector. No SSE, no live node highlighting — static definition only.

The left panel renders `Loading graph…` / a red error message / the `ReactFlow` canvas depending on fetch state. The `ReactFlow` instance is configured with `nodesDraggable={false}`, `nodesConnectable={false}`, `elementsSelectable={false}`, `fitView`, and `colorMode="dark"`.

The right panel is unchanged from R7 — messages and state with the same loading/empty states.

**Files changed:** `components/NextGenWorkflow.tsx`

---

### R9 — Workflow run name in session storage

Added `workflowRunName: string` to the `WorkflowEntry` interface. When a new run is started, `workflowRunName` is set to `"Workflow Run #n"` where `n = entries.length + 1` (computed before the new entry is pushed, so it reflects the count of all prior runs in the current session).

**Files changed:** `components/NextGenWorkflow.tsx`

---

### R10 — View Workflows page with AG Grid

Created `components/ViewWorkflows.tsx` and `app/view-workflows/page.tsx`. Wired up the previously-disabled "View Workflows" navbar item to `/view-workflows`.

`ViewWorkflows` is a `"use client"` component that reads from `sessionStorage` under `WORKFLOWS_KEY` on mount (via `useEffect`). Because Next.js App Router unmounts and remounts the page component on each navigation, this naturally loads fresh data every time the user visits the page — no polling required.

Uses AG Grid Community v35 (`ag-grid-community` + `ag-grid-react`) with `AllCommunityModule` and `themeQuartz.withPart(colorSchemeDark)` for a dark theme consistent with the app's UI.

Columns: Workflow Run Name (`workflowRunName`, falls back to `""` for pre-R9 entries), Run ID (`threadId`), Graph Name (looked up from `AGENT_CONFIG` by `graphId`, falls back to raw `graphId` if not found), Graph ID, Status, Started At, Completed At (empty string when not set).

Also fixed `workflowV2Active` in `Navbar.tsx` to cover sub-paths (`/workflow-v2/*`) consistently with `workflowActive`.

**Files changed:** `components/ViewWorkflows.tsx` (created), `app/view-workflows/page.tsx` (created), `components/Navbar.tsx`

---

### R11 — View Workflows display refinements

- Removed the "Workflow Runs" heading — unnecessary chrome.
- Removed the Graph ID column from the grid.
- Added default sort: `startedAt` descending, via `sort: "desc"` on that column definition only.
- Updated theme to a very dark near-black palette: `backgroundColor: #0d1117`, `chromeBackgroundColor: #161b22`, `oddRowBackgroundColor: #0d1117` (disables alternating row lightening from `colorSchemeDark`), `rowHoverColor: #21262d`, `borderColor: #30363d`, `foregroundColor: #e6edf3`.
- Set `wrapperBorderRadius: 0` and `borderRadius: 0` for square corners on the grid.
- Enabled `columnBorder: true` and `headerColumnBorder: true` for vertical separators in both cells and header. Set `headerColumnBorderHeight: "100%"` so header separators fill the full row height.
- Added `formatLocalTime` helper that converts an ISO 8601 string to local-timezone `HH:mm:ss.SSS` (24-hour, no date). Applied as `valueFormatter` on both Started At and Completed At columns.

**Files changed:** `components/ViewWorkflows.tsx`

---

### R12 — Workflow Run Name as clickable link

Added a `WorkflowRunNameRenderer` cell renderer component to `ViewWorkflows.tsx`. The renderer receives `value` (the run name string) and `data.threadId` (from the full row) via `ICellRendererParams<RowData>`, and renders a Next.js `<Link>` pointing to `/workflow-v2/${data.threadId}`. Clicking navigates client-side to the existing view-mode route, allowing the user to review the completed workflow's graph, messages, and state. Styled with `text-blue-400 hover:text-blue-300 hover:underline`.

**Files changed:** `components/ViewWorkflows.tsx`

---

### R13 — Rename "Run ID" column header to "Workflow Run ID"

Updated the `headerName` for the `threadId` column in `ViewWorkflows.tsx` from `"Run ID"` to `"Workflow Run ID"`.

**Files changed:** `components/ViewWorkflows.tsx`

---

### R14 — Live node highlighting in the graph

Uses `agent.state.completed_steps` (already flowing through `useAgent`) to highlight completed nodes on the ReactFlow graph in real time. No new hooks, state, effects, or files — two computed values derived during render and one change to the ReactFlow JSX.

**Node ID mapping:**
- Each entry `s` in `completed_steps` maps to `s + "_node"` (e.g. `"step_1"` → `"step_1_node"`).
- `"__start__"` is added to the completed set when `completed_steps.length > 0` (graph entry has been traversed).
- `"__end__"` is added when `agent.state?.status === "complete"`. Only lowercase `__end__` is needed — both graphs import `END` from `langgraph.graph` which resolves to `"__end__"` (confirmed by reading `langgraph/constants.py` and both graph source files). The `__END__` variant in earlier helpers was unnecessary defensive code and is not used.

**No "running" state:** both the AG-UI and raw LangGraph streams fire only on node *completion*, not on node *start*. There is no reliable way to identify the currently-executing node (particularly on branching graphs), so only two visual states are used: default (not yet run) and completed.

**Colours (dark-mode, consistent with industry conventions):**
- Default: no style override — ReactFlow dark defaults (gray border, dark background).
- Completed: `border: '2px solid #10b981'` (Tailwind emerald-500) + `backgroundColor: 'rgba(16, 185, 129, 0.12)'` (subtle green tint). Matches the dominant pattern across dark-mode workflow tools (Temporal, Prefect, LangSmith).

**Reset behaviour:** `handleStartWorkflow` already calls `agent.setState({})` before each run, which clears `completed_steps`, so all nodes automatically revert to the default style at the start of every new run. Highlighting also works correctly in view mode (loading a past thread via URL) because `connectAgent` restores the final `agent.state` including `completed_steps`.

**Post-implementation fixes:**

- **Router node never colored:** `router_node` in both graphs originally returned only `{"status": "running"}` with no `completed_steps` entry. Fixed by adding `"completed_steps": ["router"]` to the running branch in both `agent_auto_ex_1.py` and `agent_auto_ex_2.py`. This maps to `"router_node"` via the standard `s + "_node"` rule.

- **Completed steps not clearing on navigation back to `/workflow-v2`:** `completedSteps` was derived unconditionally from `agent.state`, so stale data from a previous run persisted after navigating back to the no-thread route. Fixed by guarding both `completedSteps` and the `__end__` addition with `currentThreadId`: `const completedSteps = currentThreadId ? (agent.state?.completed_steps ?? []) : []` and `if (currentThreadId && rawStatus === "complete") completedNodeIds.add("__end__")`.

- **View mode showing stale data / wrong graph for replayed threads:** Two bugs:
  1. The view-mode `useEffect` had a `hasData` short-circuit that skipped `connectAgent` whenever `agent.messages` or `agent.state` was non-empty. Since CopilotKit stores agent state globally (not per-component), navigating to any thread view after a live run would find `hasData = true` and display the stale prior-run data instead of replaying the requested thread. Fixed by removing the `hasData` guard entirely — the existing `viewConnectedRef.current === threadIdProp` check is sufficient for deduplication.
  2. The graph fetch `useEffect` had no cancellation guard. On navigation to a thread with a different graph (e.g. ex_2), the component initially renders with `selectedGraphId = "agent_auto_ex_1"` (default), starts a fetch for ex_1, then the graph-restore effect updates `selectedGraphId` to ex_2 and starts a fetch for ex_2. Both fetches are in-flight simultaneously; whichever resolves last wins, causing the stale ex_1 graph to overwrite the ex_2 graph non-deterministically. Fixed by adding a `cancelled` flag with a cleanup function so that the stale ex_1 response is discarded when the effect re-runs for ex_2.

**Files changed:** `components/NextGenWorkflow.tsx`, `agent-auto/graphs/agent_auto_ex_1.py`, `agent-auto/graphs/agent_auto_ex_2.py`

---

### R15 — Hide ReactFlow attribution panel

Added `proOptions={{ hideAttribution: true }}` to the `<ReactFlow>` component in `NextGenWorkflow.tsx`. This is an official first-class prop provided by the open-source `@xyflow/react` library — it passes through to the internal `Attribution` component which returns `null` when set. The library includes a `data-message` on the attribution element asking that it only be hidden by Pro subscribers, but there is no license enforcement in the OSS build.

**Files changed:** `components/NextGenWorkflow.tsx`

---

### R16 — Status bar and panel labels

**Status bar (always visible):** Replaced the conditional two-field `Run ID / Status` line with a permanently-rendered four-field status bar so the graph definition never shifts on run start. Fields: Run Name, Status, Started At, Completed At. All four boxes are always present; they are empty when no thread is active. Time fields use `HH:mm:ss.SSS` local time (same as ViewWorkflows). The Run Name box carries a `title` attribute (`Run ID: <threadId>`) so the full thread ID is accessible via vanilla HTML5 tooltip on hover.

**Styling:** Each field is rendered by a module-level `StatusField` helper component (presentation-only, no agent state). Label above the box: `text-[10px] font-semibold uppercase tracking-wider text-gray-500`. Box: `h-7 rounded border border-gray-700 bg-gray-800/50 text-xs text-gray-300 font-mono truncate` — consistent with the select element palette, visually distinct as read-only.

**Run meta data:** Added `RunMeta` interface (`name`, `startedAt`, `completedAt?`) and `runMeta` state. A `useEffect` keyed on `[currentThreadId]` reads the matching `WorkflowEntry` from session storage whenever the active thread changes (including clearing to `null` when the thread is deselected). In `handleStartWorkflow` the `completedAt` timestamp is written to both session storage and `runMeta` state when the run finishes or errors, rather than relying on an effect re-run.

**Panel labels:** Added a permanent `"Workflow Graph"` heading (`text-sm font-semibold text-gray-300`) above the ReactFlow canvas. Moved the `"Messages"` heading to always be the top of the right panel (previously it only appeared when messages were present). Both headings use identical typography so they are vertically aligned, and both content areas (ReactFlow canvas, messages list) have their tops aligned.

**Files changed:** `components/NextGenWorkflow.tsx`

**Post-implementation refinements:**

- **Externalised `STATUS_LABELS`:** Created `lib/workflow-status.ts` exporting `STATUS_LABELS: Record<string, string>` (idle/running/complete/error) and `mapStatusLabel(status)` (returns `""` for falsy input, falls back to the raw value for unknown keys). Both `NextGenWorkflow.tsx` and `ViewWorkflows.tsx` now import from this file; the local `STATUS_LABELS` constant in `NextGenWorkflow.tsx` was removed. `ViewWorkflows.tsx` gained a `valueFormatter` on the Status column that calls `mapStatusLabel`, replacing raw string display.

- **Status not clearing on navigation:** `rawStatus` was read unconditionally from `agent.state`, so navigating back to `/workflow-v2` (no thread) still showed "Complete" from the last run. Fixed by guarding the derivation: `const rawStatus = currentThreadId ? (agent.state?.status as string | undefined) : undefined`. This also correctly clears the `__end__` node highlight on navigation since that condition depends on `rawStatus`.

- **Toolbar restructure:** Removed the separate status-bar `<div>` below the toolbar. Status fields now live inside the same toolbar row, grouped in a `ml-auto` wrapper that pushes them to the right-hand side. Added a small `flex-col` wrapper around the graph selector with a `"Workflow"` label (same `text-[10px] font-semibold uppercase tracking-wider text-gray-500` typography as the status field labels) so the selector is visually labelled. The toolbar now uses `items-end` alignment so all columns — labelled selector, Start Workflow button, and labelled status fields — share a common baseline.

- **"Workflow Graph" label shortened to "Graph":** Consistent with the new "Workflow" label above the selector.

- **Toolbar alignment and spacing:** Added `-ml-[3px]` to the Workflow selector wrapper to align it with the Graph label in the panel below. Changed `pb-3` (12 px) to `pb-[18px]` on the toolbar `<div>` for ~6 px of extra vertical separation between the toolbar and the graph/messages panels.

- **Box height:** Changed `h-7` (28 px) to `h-8` (32 px) on status field value boxes to match the height of the select element.

- **Immediate tooltip (CSS hover):** Replaced the HTML `title` attribute on `StatusField` with a custom CSS tooltip. The `title` attribute triggers the native browser tooltip which has a ~500 ms–1 s OS-level delay. The new implementation adds `group cursor-help` to the wrapper and renders an absolutely-positioned `<div>` below (`top-full mt-1`) that is `hidden` by default and `group-hover:block` on hover — zero delay, no extra dependency.

**Files changed:** `components/NextGenWorkflow.tsx`, `lib/workflow-status.ts` (created), `components/ViewWorkflows.tsx`

---

### R17 — ReactFlow graph canvas styling

Removed the `<Background />` component (and its `Background` import) from the ReactFlow canvas. The dot-grid overlay is appropriate for editable diagram tools but adds visual noise to a read-only workflow view.

Set `style={{ background: "#0a0a0a" }}` directly on the `<ReactFlow>` component. `colorMode="dark"` sets CSS variables that produce a medium-grey canvas by default; the inline `style` prop overrides the rendered container div's background to near-black. `#0a0a0a` was chosen over pure `#000000` to avoid harsh contrast against the surrounding UI.

Added `border border-gray-700` and `rounded` to the `<div className="h-full w-full">` wrapper that contains `<ReactFlow>`. `border-gray-700` matches the border used on the status-field value boxes (established in R16), giving the canvas a consistent pale border at the same weight as the rest of the component. The border is placed on the wrapper rather than on `<ReactFlow>` itself to avoid interfering with ReactFlow's internal layout.

**Files changed:** `components/NextGenWorkflow.tsx`

---

### R18 — JSON syntax highlighting for the State panel

Replace the plain `<pre>` block used to render `agent.state` in the right-hand panel with a syntax-highlighted view using `react-syntax-highlighter`.

**Package:** `react-syntax-highlighter` (npm). Use the `PrismLight` named export (the tree-shakeable lighter build) and register only the `json` language — this avoids bundling the full Prism language registry, which is important for Next.js bundle size. Types are provided via `@types/react-syntax-highlighter`.

**Rendering:** Replace the existing `<pre>` element (lines 439-441 in `NextGenWorkflow.tsx`) with a `<PrismLight>` component. Pass `language="json"` and `{JSON.stringify(agent.state, null, 2)}` as children. The `"State"` heading and the outer `flex flex-col gap-2` wrapper are retained unchanged.

**Theme:** `vscDarkPlus` (imported from `react-syntax-highlighter/dist/esm/styles/prism`). Matches VS Code's Dark+ palette — high contrast, widely recognised, good legibility for key/string/number/boolean distinction.

**Line numbers:** Disabled.

**Background:** `#0a0a0a` — matches the ReactFlow canvas background (R17), set via `customStyle` to override the theme's own `#1e1e1e`. The messages block above it retains its existing `bg-gray-900` (`#111827`) background unchanged.

**`customStyle`:** `{ margin: 0, borderRadius: "0.375rem", overflow: "auto", fontSize: "0.75rem", background: "#0a0a0a" }`. `margin: 0` removes the default top/bottom margin the component adds; `borderRadius` matches Tailwind's `rounded`; `fontSize` matches the `text-xs` scale used elsewhere in the panel.

**`registerLanguage` call:** Placed at module level (outside the component) so it runs once on import rather than on every render.

**Files changed:** `components/NextGenWorkflow.tsx`

### R19 — Navbar font size increase

Increased the font size of both group labels and nav item buttons in `components/Navbar.tsx`.

- **Group labels** ("Workflows", "Conversations"): `text-xs` (12px) → `text-base` (16px), via two steps: `text-xs` → `text-sm` → `text-base`.
- **Nav item buttons**: The `size="sm"` Button variant sets `text-[0.8rem]` (12.8px). Added `text-base` to each button's `className`; tailwind-merge overrides the variant's text size while leaving button height and padding unchanged. Applied to all five buttons: Run Workflow, Run Workflow V2, View Workflows, and the dynamic conversation entries.

**Files changed:** `components/Navbar.tsx`

---

## Status

| Requirement | Status |
|-------------|--------|
| R1 — Establish baseline | Complete |
| R2 — Correct agent ID | Complete |
| R3 — Graph selector | Complete |
| R4 — Reset on change / new run | Complete |
| R5 — Rename to `NextGenWorkflow` | Complete |
| R6 — Session storage tracking + status display | Complete |
| R7 — Routing | Complete |
| R8 — Static graph visualizer | Complete |
| R9 — Workflow run name in session storage | Complete |
| R10 — View Workflows page with AG Grid | Complete |
| R11 — View Workflows display refinements | Complete |
| R12 — Workflow Run Name as clickable link | Complete |
| R13 — Rename "Run ID" column to "Workflow Run ID" | Complete |
| R14 — Live node highlighting | Complete |
| R15 — Hide ReactFlow attribution panel | Complete |
| R16 — Status bar and panel labels | Complete |
| R17 — ReactFlow graph canvas styling | Complete |
| R18 — JSON syntax highlighting for State panel | Complete |
| R19 — Navbar font size increase | Complete |

