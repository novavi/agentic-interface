# CopilotKit Frontend — Routing

## Goal

Replace the current `activeView` useState switch with SPA-style client-side routing. Every conversation and workflow run gets its own URL, enabling browser refresh, addressbar visibility, and a foundation for conversation/workflow history.

## Status

| Requirement | Status |
|---|---|
| R1: Restructured navbar | Complete |
| R2: Client-side routing | Complete |
| R3: Session storage | Complete |

---

## Requirements

### R1: Restructured navbar

The two flat buttons ("Workflow", "Conversation") are replaced with two non-clickable group headers, each with child navigation items.

**Workflows** (non-clickable heading)
- **Run Workflow** → `/workflow` — wired to `Workflow.tsx`
- **View Workflows** — placeholder; rendered but not interactive, no route

**Conversations** (non-clickable heading)
- **Conversation 1** → `/conversation/<threadId-1>` — wired to `Conversation.tsx`
- **Conversation 2** → `/conversation/<threadId-2>` — wired to `Conversation.tsx`

Active item is determined by `usePathname()` matching rather than an `activeView` prop.

### R2: Client-side routing

| Route | Page file | Notes |
|---|---|---|
| `/` | `app/page.tsx` | Server-side redirect to `/workflow` |
| `/workflow` | `app/workflow/[[...slug]]/page.tsx` | No active thread; graph definition view |
| `/workflow/[threadId]` | `app/workflow/[[...slug]]/page.tsx` | Active or completed run |
| `/conversation/[threadId]` | `app/conversation/[threadId]/page.tsx` | Specific conversation thread |

An **optional catch-all** (`[[...slug]]`) is used for the workflow route so `/workflow` and `/workflow/<threadId>` share the same page component — and therefore the same `Workflow` React instance. This avoids remounting the component when `router.push('/workflow/<threadId>')` is called from within a running workflow.

**"Start Workflow" flow:**
1. Generate a new UUID for `threadId`.
2. Configure the agent: `agent.threadId = newThreadId`, `agent.setMessages([...])`.
3. Call `copilotkit.runAgent({ agent })` — do not await; starts the run asynchronously.
4. Call `router.push('/workflow/${newThreadId}')` — updates the addressbar.
5. Append a new entry to `agentic-interface-workflows` in session storage with `status: "running"`.

**Load with existing threadId (refresh / direct URL):**
- Look up the entry in `agentic-interface-workflows` by threadId.
- If `status === "running"`: enter streaming mode (same SSE path as Phase 3).
- If status is terminal or entry is not found: show graph definition view.

### R3: Session storage

`agentic-interface-conversational-threadid` is removed. Two structured arrays replace it.

**`agentic-interface-conversations`** — JSON string, value is an array:
```ts
Array<{
  threadId: string;
  graphId: string;    // e.g. "agent_convo_basic"
  name: string;       // "Conversation 1" / "Conversation 2"
  createdAt: string;  // ISO 8601
}>
```

On first load: if the array is missing or has fewer than 2 entries, the missing entries are created with fresh UUIDs. On subsequent loads, the existing entries are reused unchanged.

**`agentic-interface-workflows`** — JSON string, value is an array:
```ts
Array<{
  threadId: string;
  graphId: string;
  status: "running" | "complete" | "error";
  startedAt: string;    // ISO 8601
  completedAt?: string; // ISO 8601; set when status becomes "complete" or "error"
}>
```

Initialized as `[]` on first load. A new entry is appended each time the user clicks "Start Workflow". The entry is updated when the SSE connection closes (complete) or errors.

---

## Architecture

### File structure after this change

```
app/
├── layout.tsx                         ← root layout: Providers + sidebar shell + {children}
├── page.tsx                           ← server-side redirect to /workflow
├── workflow/
│   └── [[...slug]]/
│       └── page.tsx                   ← renders <Workflow threadId={slug?.[0] ?? null} />
└── conversation/
    └── [threadId]/
        └── page.tsx                   ← renders <Conversation threadId={params.threadId} />
```

The two-column layout (sidebar + main content area) moves from `app/page.tsx` into `app/layout.tsx`. The sidebar persists across route changes without remounting.

### Component changes

**`app/layout.tsx`** — Extended:
- Wrap everything in `<Providers>`.
- Render `<LayoutClient>` which owns the sidebar shell and session storage init.

**`components/LayoutClient.tsx`** (new client component):
- Manages an `initialized` state (null until the first `useEffect` fires).
- On mount, runs `initSessionStorage()`: reads `agentic-interface-conversations`, creates/pads to 2 entries if needed; reads `agentic-interface-workflows`, initializes as `[]` if missing.
- While `initialized === null`: renders a full-window centered spinner (`Loader2`).
- Once initialized: renders the persistent app shell — header, sidebar with `<Navbar conversations={...} />`, and `{children}` in the main content area.
- Passes the resolved `ConversationEntry[]` array directly to `<Navbar>` as a prop (no session storage read in Navbar).

**`components/Navbar.tsx`** — Full rewrite:
- Client component.
- Receives `conversations: ConversationEntry[]` as a prop (pre-loaded by `LayoutClient`).
- Uses `usePathname()` for active state — no `activeView` prop.
- Renders two labelled sections: "Workflows" and "Conversations" as non-interactive headings.
- "View Workflows" is a `<span>` with muted, non-interactive styling.
- Uses `Button` with `asChild` + `Link` for nav items.

**`components/Conversation.tsx`** — Minor change:
- Remove internal session storage logic (`THREAD_ID_KEY`, `useEffect`).
- Accept `threadId: string` as a prop; pass it directly to `<CopilotChat>`.

**`components/Workflow.tsx`** — Moderate change:
- Accept `threadId: string | null` as a prop.
- Keep `currentThreadId` in `useState`, initialized from the prop; a `useEffect` keeps it in sync when the prop changes (back/forward navigation).
- A second `useEffect` restores `selectedGraphId` from `agentic-interface-workflows` on mount with a non-null prop.
- `handleStartWorkflow`: set local state → append to `agentic-interface-workflows` → configure agent → fire `runAgent()` (no await) → `router.push('/workflow/${newThreadId}')`.
- `handleGraphChange`: update `selectedGraphId` → `router.push('/workflow')` to clear the active thread.
- `handleConnectionStateChange` (`useCallback`): updates the session storage entry's `status`/`completedAt` when the SSE connection closes or errors; passed to `WorkflowVisualizer` as a callback.

**`components/WorkflowVisualizer.tsx`** — Minor addition:
- Export `ConnectionState` type.
- Add `onConnectionStateChange?: (state: ConnectionState) => void` optional prop.
- A `useEffect` calls the callback whenever `connectionState` changes (skips `null`).

---

## Design decisions

**Optional catch-all vs two separate page files**: The optional catch-all (`[[...slug]]`) is chosen because both `/workflow` and `/workflow/<threadId>` render the same `Workflow` component. With separate page files, React would unmount and remount the component on navigation, which creates a lifecycle conflict with `copilotkit.runAgent()` already in flight.

**Session storage scope**: Session storage is per-tab and cleared when the tab is closed. This means conversation threadIds (and therefore CopilotKit conversation history) reset on each new browser session. This matches the existing behavior established in prior phases. If persistent cross-session history is needed later, localStorage would replace session storage.

**`graphId` recovery on refresh**: If a user refreshes `/workflow/<threadId>` and the session storage entry is missing (cleared), the `graphId` cannot be recovered from the URL alone. The component falls back to the first workflow agent in `AGENT_CONFIG`.

---

## Open questions

**OQ1 — "View Workflows" visual treatment**: ✅ Plain non-interactive `<span>` with muted/disabled styling.

**OQ2 — Conversation link hydration**: ✅ `LayoutClient` renders a full-window centered spinner until the session storage init effect completes, then renders the full app shell (header + sidebar + children). No partial state where links are disabled.

**OQ3 — Default route**: ✅ `/` redirects to `/workflow`.
