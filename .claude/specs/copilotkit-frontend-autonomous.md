# CopilotKit-based Frontend — Autonomous

## Status
Implemented ✅

---

## Goal
Add a left-hand sidebar navigation and a new Workflow view to the frontend, enabling users to trigger and observe the `agent_auto_example` autonomous agent without a chat interface.

---

## Resolved Questions

1. **Navigation approach**: Client-side `activeView` state in `page.tsx` (SPA-style, no URL change). ✅
2. **Default active view on load**: Workflow. ✅
3. **Workflow output content**: Both AI text messages AND raw state fields (`completed_steps`, `step_timings`, `decision`, `status`). ✅
4. **CopilotKit hook**: `useAgent` is confirmed as the v2 hook (found at `src/v2/hooks/use-agent.tsx` in the installed package). `useCoAgent` and `useCopilotChat` are v1 only. ✅

---

## Architecture Notes

### Navigation
The empty `<aside>` placeholder in `page.tsx` became the navbar. Navigation is driven by a `view` state variable (`"workflow" | "conversation"`) in the top-level page component, defaulting to `"workflow"`, which conditionally renders `<Workflow />` or `<Conversation />`.

### CopilotKit Provider
`CopilotKitProvider` is already present at the root level in `components/Providers.tsx` with `runtimeUrl="/api/copilotkit"`. **No changes were needed to the provider.** Both views' hooks (`useAgent`, `useCopilotKit`) resolve through this existing provider.

### Hook pattern for triggering the agent (no chat UI)

`useAgent` returns `{ agent }` — an `AbstractAgent` from `@ag-ui/client`. `useCopilotKit` returns `{ copilotkit }` which has a `runAgent` method. This is the same internal pattern used by `CopilotChat` itself.

```typescript
import { useAgent, useCopilotKit } from "@copilotkit/react-core/v2";

const AGENT_ID = process.env.NEXT_PUBLIC_DEFAULT_AUTONOMOUS_AGENT ?? "agent_auto_example";

// On button click:
const newThreadId = crypto.randomUUID();
agent.threadId = newThreadId;
agent.setMessages([{ id: crypto.randomUUID(), role: "user", content: "start workflow" }]);
await copilotkit.runAgent({ agent });
```

Note: `crypto.randomUUID()` (Web Crypto API) is used for both the thread ID and the message ID — no import needed.

### Reading output
- `agent.messages` — reactive array of `Message[]`; re-renders triggered by `useAgent`'s `OnMessagesChanged` subscription. Filter for `role === "assistant"` to show only agent responses.
- `agent.state` — reactive object containing the full `WorkflowState` (`status`, `completed_steps`, `step_timings`, `decision`); updated via `StateSnapshotEvent`/`StateDeltaEvent`, re-renders triggered by `useAgent`'s `OnStateChanged` subscription.

### Thread IDs
- **Conversation view**: retains its existing `sessionStorage`-backed thread ID.
- **Workflow view**: each button click generates a fresh `crypto.randomUUID()` assigned to `agent.threadId`, since each autonomous workflow run is independent.

### Env var for autonomous agent
New `NEXT_PUBLIC_DEFAULT_AUTONOMOUS_AGENT` env var (value: `agent_auto_example`) controls which agent `Workflow.tsx` connects to — mirroring the existing `NEXT_PUBLIC_DEFAULT_CONVERSATIONAL_AGENT` pattern.

No changes needed to `route.ts` — `agent_auto_example` is already registered.

---

## Phase 1

### G1 — LHS Navbar Component

**Objective**: Replace the empty `<aside>` in `page.tsx` with a shadcn-based sidebar nav containing two items: **Workflow** (first, default) and **Conversation** (second).

**shadcn components installed**:
```bash
npx shadcn@latest init       # style: Nova (radix-nova)
npx shadcn@latest add button
npx shadcn@latest add separator
```

**Files created/modified**:

| File | Action |
|------|--------|
| `frontend/components/Navbar.tsx` | Create |
| `frontend/app/page.tsx` | Modify |

**Navbar props interface**:
```typescript
type View = "workflow" | "conversation";

interface NavbarProps {
  activeView: View;
  onViewChange: (view: View) => void;
}
```

**Acceptance criteria**:
- [x] Navbar renders in the left sidebar with "Workflow" and "Conversation" items
- [x] "Workflow" is listed first; "Conversation" second
- [x] Active item is visually highlighted (distinct from inactive)
- [x] Clicking an item updates the active view rendered in the main area

---

### G2 — Conversation View

**Objective**: Extract the current `page.tsx` chat interface into a standalone `Conversation.tsx` component so `page.tsx` becomes a layout shell.

**Files created/modified**:

| File | Action |
|------|--------|
| `frontend/components/Conversation.tsx` | Create |
| `frontend/app/page.tsx` | Modify |

**What moved into `Conversation.tsx`**:
- `THREAD_ID_KEY` and `DEFAULT_AGENT_ID` constants
- `threadId` state and `useEffect` for `sessionStorage` initialisation
- Skeleton loading state (shown while `threadId` is null)
- `<CopilotChat>` component with all its current props and labels

**What stayed in `page.tsx`**:
- `<header>` bar
- `view` state (type `"workflow" | "conversation"`, default `"workflow"`)
- `<Navbar>` in `<aside>`
- Conditional render: `view === "workflow" ? <Workflow /> : <Conversation />`

**Acceptance criteria**:
- [x] Conversation view renders identically to the current `page.tsx` chat interface
- [x] No regression in chat functionality (thread persistence, welcome message, agent connectivity)

---

### G3 — Workflow View

**Objective**: Create a `Workflow.tsx` component that triggers `agent_auto_example` and displays its output without a chat interface.

**New env vars**:
```
NEXT_PUBLIC_DEFAULT_AUTONOMOUS_AGENT=agent_auto_example
```
Added to:
- `frontend/.env.local` (below `NEXT_PUBLIC_DEFAULT_CONVERSATIONAL_AGENT`)
- `frontend/.env.local.example` (same position)

**Files created/modified**:

| File | Action |
|------|--------|
| `frontend/components/Workflow.tsx` | Create |
| `frontend/.env.local` | Modify |
| `frontend/.env.local.example` | Modify |

**Component behaviour**:
- "Start Workflow" button at the top of the view
- On click:
  1. Generate a fresh thread ID: `const newThreadId = crypto.randomUUID()`
  2. Store it in component state: `setCurrentThreadId(newThreadId)`
  3. Assign it to the agent: `agent.threadId = newThreadId`
  4. Set messages to a single user trigger: `agent.setMessages([{ id: crypto.randomUUID(), role: "user", content: "start workflow" }])`
  5. Call `await copilotkit.runAgent({ agent })`
- When a run has been initiated, display the current thread ID above the output area (e.g. `Run ID: 3f2a1b4c-...`) in monospace font
- Two output areas rendered below, both in monospace font (`font-mono` / Courier New):
  - **Messages**: AI messages from `agent.messages` filtered to `role === "assistant"`, rendered as text
  - **State**: `agent.state` rendered as a formatted JSON block (covers `status`, `completed_steps`, `step_timings`, `decision`)
- No chat input field anywhere in this component
- `NEXT_PUBLIC_DEFAULT_AUTONOMOUS_AGENT` env var (with fallback `"agent_auto_example"`) controls which agent is used

**Rationale for fresh thread ID per run**: Each autonomous workflow run is independent with no need to carry state from previous runs. Using a fresh UUID guarantees the agent starts from a clean slate each time. This contrasts with the Conversation view, which persists its thread ID across page refreshes.

**Trigger message note**: `"start workflow"` (lowercase) matches `WORKFLOW_TRIGGER_MESSAGE` in `agent.py` which does a case-insensitive check, so this is safe.

**Acceptance criteria**:
- [x] "Start Workflow" button is visible at the top of the Workflow view
- [x] Clicking the button sends `"start workflow"` to `agent_auto_example` on a fresh thread
- [x] The current run's thread ID is displayed above the output area after the button is clicked
- [x] AI message responses appear in monospace font
- [x] `agent.state` (including `completed_steps`, `step_timings`, etc.) is displayed as formatted JSON in monospace font
- [x] No chat input field is rendered
- [x] `NEXT_PUBLIC_DEFAULT_AUTONOMOUS_AGENT` env var controls which agent is connected

---

## Phase 1 — Files Changed (Summary)

| File | Action |
|------|--------|
| `frontend/components/Navbar.tsx` | Create |
| `frontend/components/Conversation.tsx` | Create |
| `frontend/components/Workflow.tsx` | Create |
| `frontend/app/page.tsx` | Modify |
| `frontend/app/globals.css` | Modify (font fix + post-implementation tweaks — see below) |
| `frontend/.env.local` | Modify |
| `frontend/.env.local.example` | Modify |
| `frontend/components/Providers.tsx` | Modify (import paths updated for tool-renderer move — see below) |

No changes to:
- `frontend/app/api/copilotkit/route.ts` — both agents already registered

---

### Tool-renderer restructuring (done alongside Phase 1)

Four pre-existing components were moved into a new `frontend/components/tool-renderers/` subfolder to keep the `components/` root tidy as it grows. Folder uses kebab-case, consistent with Next.js conventions for non-route directories.

| File | Action |
|------|--------|
| `frontend/components/tool-renderers/CompanyOverviewCard.tsx` | Moved (was `components/CompanyOverviewCard.tsx`) |
| `frontend/components/tool-renderers/CompanyOverviewToolRenderer.tsx` | Moved (was `components/CompanyOverviewToolRenderer.tsx`) |
| `frontend/components/tool-renderers/StockDataToolRenderer.tsx` | Moved (was `components/StockDataToolRenderer.tsx`) |
| `frontend/components/tool-renderers/StockPriceChart.tsx` | Moved (was `components/StockPriceChart.tsx`) |
| `frontend/components/Providers.tsx` | Modify — updated import paths to `./tool-renderers/…` |

Internal imports between the tool-renderer files (`./CompanyOverviewCard`, `./StockPriceChart`) required no changes as they remain siblings within the subfolder.

---

### Post-implementation tweaks

#### Font fix (`frontend/app/globals.css`)
`npx shadcn@latest init` introduced a self-referential CSS variable (`--font-sans: var(--font-sans)`) in the `@theme inline` block, causing the browser to fall back to Times New Roman. Two fixes applied:

1. `@theme inline` — corrected `--font-sans: var(--font-geist-sans)` and `--font-heading: var(--font-geist-sans)` (both now point directly to the Next.js font variable).
2. `@layer base` — replaced `html { @apply font-sans; }` with `html { font-family: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif; }` — sets the font unconditionally without depending on `@theme inline` resolution, ensuring Geist Sans is always applied via the CSS variable Next.js injects onto the `html` element at runtime.

#### Cursor and border-radius tweaks
- **`frontend/components/Navbar.tsx`** — added `cursor-pointer rounded-sm` to navbar item buttons. `cursor-pointer` shows the hand cursor on hover; `rounded-sm` overrides shadcn's default `rounded-lg` for a tighter corner radius appropriate for sidebar nav items.
- **`frontend/components/Workflow.tsx`** — added `cursor-pointer` to the Start Workflow button. Corner radius left at the shadcn default (`rounded-lg`).

---

## Future Enhancements

- **Disable "Start Workflow" button while running**: Read `agent.isRunning` (boolean property on `AbstractAgent`) to disable the button and show a loading/spinner state during execution. Re-enable on completion or error.
- **Step-by-step visual progress tracker**: Replace the raw JSON state dump with a structured list of steps showing name, status (pending / running / complete), and elapsed time — driven by `completed_steps` and `step_timings`.
- **Stop / cancel workflow**: Add a "Stop" button calling `agent.abortRun()` to interrupt a running workflow.
- **Per-run output history**: Retain and display output from multiple previous workflow runs within the same session, rather than overwriting on each trigger.
