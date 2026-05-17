# Plan: CopilotKit-based Frontend — Workflow Visualization — Phase 3 Improvements

Related spec: [copilotkit-frontend-workflow-visualization-phase-123.md](./copilotkit-frontend-workflow-visualization-phase-123.md)
Debug investigation: [workflow-replay-debug-investigation.md](./workflow-replay-debug-investigation.md)

---

## Overview

Introduce a clear, explicit `WorkflowMode` into `Workflow.tsx` to distinguish two distinct
operational states:

- **`run` mode** — a workflow is currently executing. CopilotKit's `runAgent()` path is live.
  `agent.state` and `agent.messages` populate in real time as AG-UI events stream in.
- **`view` mode** — a completed (or errored) workflow is being inspected. CopilotKit's
  `connectAgent()` path replays the stored event history into the agent, populating
  `agent.state` and `agent.messages` from `GLOBAL_STORE`.

A third non-mode, **`idle`**, applies when no `threadId` is in the URL.

The `debug-replay` page proved that the `connectAgent()` replay pipeline works when the effect
correctly depends on `[agent]`, allowing re-execution when the agent transitions from provisional
to real. The changes here apply that proven pattern to `Workflow.tsx` and resolve the
state-machine ambiguity that caused the existing R5c-1 fix to silently fail.

---

## Root Cause of the R5c-1 Failure (established before this phase)

The existing `connectAgent` effect in `Workflow.tsx` omits `agent` from its dependency array:

```tsx
useEffect(() => {
  // ... calls copilotkit.connectAgent({ agent });
}, [currentThreadId]); // agent intentionally omitted
```

On page load, `useAgent` initially returns a **provisional** agent (`runtimeMode: "pending"`).
The effect fires once with this provisional agent and calls `connectAgent`. The provisional
agent's HTTP call either silently fails (transport not yet resolved) or posts to the wrong URL.

When the runtime finishes syncing and `useAgent` returns the **real** agent, the effect does NOT
re-run (because `agent` is not in the deps). The `connectAgent` call is never retried with the
working agent, so `agent.state` stays empty.

**Fix:** add `agent` to the effect's dependency array, match the cleanup from `CopilotChat`, and
use a `lastViewedThreadIdRef` to avoid redundant calls when only `agent` changes (rather than
when a new thread is loaded).

---

## Definitions

```typescript
type WorkflowMode = "idle" | "run" | "view";
```

| Mode | Condition | CopilotKit path |
|------|-----------|-----------------|
| `idle` | `currentThreadId === null` | — |
| `run` | `handleStartWorkflow` was called in this React lifecycle | `runAgent()` in flight |
| `view` | all other cases with a `currentThreadId` (complete, error, running-on-refresh, unknown threadId) | `connectAgent()` |

### Mode determination rules

`resolveMode(threadId)` reads from session storage:

- `threadId === null` → `"idle"`
- entry not found in session storage → `"view"` (attempt replay anyway; GLOBAL_STORE may have data)
- `entry.status === "running"` → `"view"` *(see OQ3 resolution below)*
- `entry.status === "complete"` or `"error"` → `"view"`

**`run` mode is set imperatively**, not derived from session storage. `handleStartWorkflow` calls
`setMode("run")` directly after calling `runAgent`. This is the only path that enters run mode.
This correctly handles the `status: "running"` on-refresh case: if the user refreshes mid-run,
`resolveMode` returns `"view"` (since `handleStartWorkflow` has not been called in this
lifecycle), and `connectAgent` replays whatever `GLOBAL_STORE` has.

**Transition run → view:** When `handleConnectionStateChange("closed")` fires, it updates
session storage to `status: "complete"` and calls `setMode("view")`. This transitions the UI
to view mode without requiring a refresh.

---

## Resolved Open Questions

### OQ1 — Graph tab in view mode (resolved)

Pass `null` as `currentThreadId` to `WorkflowVisualizer` in view mode. The Graph tab shows the
static graph definition — the same clean diagram displayed before any run starts. No second SSE
connection is opened.

### OQ2 — Loading state while connectAgent is in flight (resolved)

Show a `Loader2` spinner in `WorkflowRawView` while the page is in view mode and
`connectAgent` is in flight. `Workflow.tsx` tracks a boolean `isConnecting` state that is set
`true` before `connectAgent` is called and `false` in the `.then()` / `.catch()` callback.
This is passed to `WorkflowRawView` as `isLoading`. The spinner shows regardless of whether
data ultimately arrives — it disappears as soon as the call resolves, revealing either the
replayed state or the "No workflow data found" message.

### OQ3 — `status: "running"` on browser refresh (resolved)

Treat as `view` mode. `resolveMode` returns `"view"` for all `status` values. The only way to
enter `run` mode is via `handleStartWorkflow` in the current React lifecycle (imperative
`setMode("run")` call).

---

## Requirements

### R1 — `WorkflowMode` type and mode state

**File:** `frontend/components/Workflow.tsx`

Add `WorkflowMode` type and a `resolveMode` helper:

```typescript
type WorkflowMode = "idle" | "run" | "view";

function resolveMode(threadId: string | null): WorkflowMode {
  if (!threadId) return "idle";
  // All cases where we have a threadId default to view — run mode is set imperatively
  return "view";
}
```

Add `mode` state, initialised synchronously (session storage is available by the time
`Workflow` renders, because `LayoutClient` gates children behind its own storage-read effect):

```tsx
const [mode, setMode] = useState<WorkflowMode>(() => resolveMode(threadIdProp));
```

Update the `currentThreadId` sync effect to also update mode:

```tsx
useEffect(() => {
  setCurrentThreadId(threadIdProp);
  setMode(resolveMode(threadIdProp));
}, [threadIdProp]);
```

Update `handleConnectionStateChange` to transition mode after updating session storage:

```tsx
const handleConnectionStateChange = useCallback((state: ConnectionState) => {
  if (!currentThreadId || state === "open") return;
  // ... existing session storage update ...
  setMode("view"); // run → view transition
}, [currentThreadId]);
```

Update `handleStartWorkflow` to set run mode imperatively:

```tsx
const handleStartWorkflow = async () => {
  // ... existing logic to create newThreadId, write session storage, set messages ...
  copilotkit.runAgent({ agent });
  setMode("run"); // imperative: only way to enter run mode
  router.push(`/workflow/${newThreadId}`);
};
```

---

### R2 — Fix the `connectAgent` effect

**File:** `frontend/components/Workflow.tsx`

Replace the existing R5c-1 effect with the corrected version:

```tsx
const [isConnecting, setIsConnecting] = useState(false);
const lastViewedThreadIdRef = useRef<string | null>(null);

useEffect(() => {
  if (mode !== "view" || !currentThreadId) return;

  // Skip if agent already has data (e.g. run just completed in this session — runAgent
  // populated state already; calling connectAgent would flash-clear it then replay).
  const hasData =
    (agent.messages?.length ?? 0) > 0 ||
    Object.keys(agent.state ?? {}).length > 0;
  if (hasData) {
    lastViewedThreadIdRef.current = currentThreadId;
    return;
  }

  // Skip redundant re-runs caused by agent provisional → real transition for the same thread.
  if (lastViewedThreadIdRef.current === currentThreadId) return;
  lastViewedThreadIdRef.current = currentThreadId;

  agent.threadId = currentThreadId;
  setIsConnecting(true);
  copilotkit
    .connectAgent({ agent })
    .then(() => setIsConnecting(false))
    .catch(() => setIsConnecting(false));

  return () => {
    lastViewedThreadIdRef.current = null; // allow retry on StrictMode remount
    agent.detachActiveRun().catch(() => {});
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [agent, mode]); // currentThreadId read from closure; agent dep handles provisional → real
```

**Why skip when data exists:** When `handleConnectionStateChange` transitions mode from `run` →
`view`, `agent.state` is already populated (filled by the preceding `runAgent` stream). Calling
`connectAgent` would call `agent.setMessages([]) + agent.setState({})` first (internal to
`copilotkit.connectAgent`), causing a brief flash of empty state before replay completes. The
`hasData` guard prevents this.

---

### R3 — WorkflowVisualizer: static graph in view mode

**File:** `frontend/components/Workflow.tsx`

```tsx
<WorkflowVisualizer
  graphId={selectedGraphId}
  currentThreadId={mode === "run" ? currentThreadId : null}
  isRunning={agent.isRunning}
  onConnectionStateChange={handleConnectionStateChange}
/>
```

In `run` mode: `currentThreadId` is passed through → SSE connection opens, live events shown.
In `view` mode: `null` is passed → static graph definition shown, no SSE connection.
In `idle` mode: `currentThreadId` is already `null` → static graph shown (existing behaviour).

---

### R4 — WorkflowRawView: spinner while connectAgent is in flight

**File:** `frontend/components/WorkflowRawView.tsx`

Add `isLoading?: boolean` prop. When `true` and no data is present, render a centred `Loader2`
spinner instead of "No workflow started yet.":

```tsx
import { Loader2 } from "lucide-react";

interface WorkflowRawViewProps {
  agent: { messages: ...; state?: ... };
  isLoading?: boolean;
}

export function WorkflowRawView({ agent, isLoading }: WorkflowRawViewProps) {
  const assistantMessages = agent.messages.filter((m) => m.role === "assistant");
  const hasState = agent.state && Object.keys(agent.state).length > 0;

  if (assistantMessages.length === 0 && !hasState) {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full text-sm text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-500">
        No workflow started yet.
      </div>
    );
  }

  // ... existing messages + state display unchanged ...
}
```

`Workflow.tsx` passes `isLoading={isConnecting}` to `WorkflowRawView`.

---

## Files to Modify

| File | Action |
|------|--------|
| `frontend/components/Workflow.tsx` | Add `WorkflowMode`, `resolveMode`, `mode` state, `isConnecting` state; update `handleStartWorkflow`, `handleConnectionStateChange`, URL sync effect; replace R5c-1 `connectAgent` effect; update `WorkflowVisualizer` and `WorkflowRawView` props |
| `frontend/components/WorkflowRawView.tsx` | Add `isLoading` prop with spinner |

---

## What Is NOT Changed

| Item | Reason |
|------|--------|
| `handleStartWorkflow` core logic | `runAgent` call, UUID generation, session storage write unchanged |
| `WorkflowVisualizer` internal logic | Only its `currentThreadId` prop changes |
| `WorkflowRawView` messages/state display | Only gains `isLoading` guard at the top |
| Session storage schema | `WorkflowEntry` shape unchanged |
| SSE proxy route | Unaffected |
| CopilotKit provider / API route | Unaffected |
| `debug-replay` page | Kept as a permanent debug tool |

---

## Known Limitations (unchanged from Phase 3c)

Both `connectAgent` replay and `WorkflowVisualizer` SSE replay rely on in-memory server state
(`GLOBAL_STORE` and `langgraph dev` in-memory checkpointer). Neither survives a Next.js dev
server restart or `langgraph dev` restart. This is a development environment constraint, not a
bug introduced here.

---

## Status

| Item | Status |
|------|--------|
| OQ1 — Graph tab in view mode | Resolved — pass `null` (static graph) |
| OQ2 — Spinner while connecting | Resolved — `Loader2` via `isConnecting` state |
| OQ3 — `status: "running"` on refresh | Resolved — treat as view mode |
| R1 implementation | Complete |
| R2 implementation | Complete |
| R3 implementation | Complete |
| R4 implementation | Complete |

---

## Phase 3e — Post-3d Bug Fixes

Three bugs were discovered and fixed in testing after Phase 3d was implemented.

---

### Bug 1 — Tab switching flicker and 500 SSE error on workflow start

**Symptom:** Clicking "Start Workflow" caused a momentary switch to Raw view, a
`GET /api/agents/{id}/stream 500` error, and the Raw view showing only partial state.

**Root cause:** `handleStartWorkflow` called `setMode("run")` then `router.push()`. The
URL change triggered the URL sync `useEffect`, which called `setMode(resolveMode(...))` = `"view"`,
overriding the imperative run mode. With `mode` briefly set to `"view"`, the
`WorkflowVisualizer` received a real `currentThreadId`, opened an SSE connection (→ 500 error),
and `connectAgent` fired, calling `agent.setMessages([]) + agent.setState({})` internally,
clearing the live stream's state mid-run.

**Fixes applied:**
1. Added `runJustStartedRef = useRef(false)`. Set to `true` in `handleStartWorkflow` before
   `router.push`. The URL sync effect checks this ref; if `true`, it resets the ref and skips
   the `setMode` override.
2. `WorkflowVisualizer` always receives `currentThreadId={null}` — SSE completely disabled.
   The SSE code is retained in `WorkflowVisualizer` for future use but never invoked.

---

### Bug 2 — Second run shows accumulated state from first run

**Symptom:** Starting a second workflow displayed old step timings and `completed_steps`
with twice as many entries as expected (two full run cycles concatenated).

**Root cause:** `useAgent` returns a **globally-cached** agent instance keyed by `agentId`,
managed by the `CopilotKitProvider`. The same agent object is returned every time
`useAgent({ agentId })` is called, regardless of component mount/unmount cycles.
`agent.setMessages([trigger])` reset messages, but `agent.state` was never cleared.
`copilotkit.runAgent({ agent })` then sent the old `agent.state` as `initialState` to the
LangGraph backend, which started the new thread with accumulated prior state.

**Key discovery:** `AbstractAgent` (from `@ag-ui/client`) exposes `setState(state: State): void`
as a public API — exactly parallel to `setMessages`. `State = any` (`z.ZodAny`), so
`agent.setState({})` is valid and clears all state.

**Architecture fix:** `useAgent` was extracted from the outer `Workflow` component into a new
inner `WorkflowSession` component (see §Architecture Refactor below). `WorkflowSession` is
keyed by `currentThreadId` — React unmounts the old instance and mounts a fresh one for each
new run. However, because `useAgent` returns the globally-cached agent, key-based remount
alone does not produce a clean agent state.

**Additional fix:** `agent.setState({})` is called before `copilotkit.runAgent({ agent })` in
the run-start effect, ensuring the backend receives `initialState: {}` for every new run.

---

### Bug 3 — Raw view does not live-update during a run; idle navigation shows stale data

**Symptom A:** During an active workflow run, the Raw tab appeared stuck (showing "No workflow
started yet"). Switching to Graph and back to Raw revealed the fully populated state —
indicating data was arriving but re-renders were not propagating.

**Symptom B:** After a completed run, soft-navigating away to Conversations and back to
`/workflow` (no threadId) displayed the previous run's data instead of the empty idle state.

**Root cause (both symptoms):** CopilotKit uses reactive property-access subscriptions
internally. `WorkflowSession` only accessed `agent.state?.status` and `agent.isRunning` in its
render body, so it only subscribed to those two fields. Updates to `agent.messages` and the
full `agent.state` during a run triggered no re-render, so `WorkflowRawView` never saw live
data. For symptom B, the globally-cached agent retained old state; the idle `WorkflowSession`
(key `"idle"`) passed this stale agent to `WorkflowRawView`, which displayed the old run.

**Fixes applied:**
1. `WorkflowSession` now reads `agentMessages = agent.messages` and `agentState = agent.state`
   in its render body before passing them as props to `WorkflowRawView`. This creates
   subscriptions to the full messages array and state object, so every incoming event during a
   run triggers a re-render that propagates to `WorkflowRawView`.
2. `WorkflowRawView` now accepts `messages` and `state` as direct props instead of an `agent`
   object prop. This makes the data flow explicit and avoids stale-closure or reference-equality
   pitfalls.
3. `WorkflowRawView` is only rendered when `threadId` is non-null. The idle state (`threadId
   = null`) renders a static "No workflow started yet." string without touching the globally-
   cached agent at all.

---

## Architecture Refactor (Phase 3e)

`Workflow.tsx` was split into two components to establish a clean separation of concerns and
prevent cross-run state contamination.

### Outer `Workflow` component — routing / navigation only

Manages: `currentThreadId`, `selectedGraphId`, `activeTab`, `mode`, `isWorkflowRunning`.

Responsibilities:
- URL sync (back/forward navigation)
- Session storage reads/writes (`WorkflowEntry`)
- `handleStartWorkflow` — creates `newThreadId`, writes session storage, sets state, pushes URL.
  Does **not** call `runAgent` directly.
- `handleConnectionStateChange` — updates session storage, clears `isWorkflowRunning`
- `handleRunComplete` — called by `WorkflowSession` on run completion; updates session storage,
  clears `isWorkflowRunning`

`handleStartWorkflow` no longer calls `copilotkit.runAgent`. It sets `setMode("run")` and
changes `currentThreadId`, which remounts `WorkflowSession` with `autoRun=true`. The inner
component calls `runAgent` on mount.

`disabled` on the Start button and graph selector is now driven by `isWorkflowRunning` (a
parent boolean state), not `agent.isRunning` (which is now inside the child component).

### Inner `WorkflowSession` component — agent lifecycle / display

Keyed by `currentThreadId ?? "idle"`. Each key change remounts the component, giving a fresh
local state scope (even though `useAgent` returns a globally-cached agent instance).

Receives: `threadId`, `graphId`, `autoRun` (bool, captured in `autoRunRef` at mount — not
reactive), `activeTab`, `onConnectionStateChange`, `onRunComplete`.

Responsibilities:
- `useAgent` / `useCopilotKit`
- Main agent effect (`[agent]` dep): calls `runAgent` (autoRun=true) or `connectAgent`
  (autoRun=false), with all prior guards (`runStartedRef`, `lastViewedThreadIdRef`, `hasData`)
- Run completion detection via `agent.isRunning` transition (`wasRunningRef`)
- Renders Run ID, Status, `WorkflowVisualizer`, `WorkflowRawView`

`autoRun` is captured in `useRef(autoRun)` at mount. Even when the URL sync effect later
changes the parent's `mode` from `"run"` to `"view"` (causing `autoRun` prop to change to
`false`), the inner component's behavior is unaffected — `runJustStartedRef` is no longer
needed.

### Files modified

| File | Change |
|------|--------|
| `frontend/components/Workflow.tsx` | Split into `Workflow` + `WorkflowSession`; `useAgent` moved to `WorkflowSession`; `agent.setState({})` added before `runAgent`; render body reads `agent.messages` + `agent.state` explicitly |
| `frontend/components/WorkflowRawView.tsx` | Props changed from `{ agent }` to `{ messages, state }` |
