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
