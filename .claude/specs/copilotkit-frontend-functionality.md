# CopilotKit-based Frontend — Functionality

## Status
Phase 1: Implemented
Phase 2: Implemented

## Overview

Functional enhancements to the conversational chat UI built in `copilotkit-frontend-conversational.md`. Each phase adds a discrete user-facing capability. The underlying CopilotKit + LangGraph infrastructure is assumed to be running (see that plan for setup).

---

## Phase 1: Persist conversation history across browser refreshes

### Goals

- Conversation history is replayed when the browser window is refreshed (same tab)
- A new conversation starts when the tab is closed and reopened (or a new tab is opened)
- No changes to the backend (`route.ts`, `agent.py`, `mcp_server.py`)

---

### Background: How thread IDs work

`<CopilotKit>` accepts an optional `threadId` prop (from `@copilotkit/react-core`). If omitted, CopilotKit auto-generates a random UUID on each mount — which is why history is lost on every page refresh.

The threadId flows automatically through the CopilotKit runtime to LangGraph as `{"configurable": {"thread_id": "..."}}`. No manual wiring in `route.ts` or `agent.py` is required.

`langgraph dev` already persists conversation checkpoints to disk in `.langgraph_api/` (pickle files via `InMemorySaver`). The backend has the history — the problem is that the frontend requests it under a different threadId each time.

**Known limitation:** `.langgraph_api/` pickle files may not survive a `langgraph dev` restart if code changes to `agent.py` or `mcp_server.py` cause pickle deserialization to fail. When this happens, `langgraph dev` silently clears the cache and starts fresh. This is a `langgraph dev` limitation and is expected in development.

---

### Mechanism: sessionStorage

`sessionStorage` is the correct storage scope:

| Property | Behaviour |
|---|---|
| Survives page refresh | ✓ Yes |
| Shared across tabs | ✗ No (tab-scoped) |
| Cleared on tab close | ✓ Yes |
| Cleared on browser close | ✓ Yes |
| Accessible server-side | ✗ No (browser-only) |

This matches the required behaviour exactly: history persists across refreshes but is not shared between tabs.

**Storage key:** `agentic-interface-conversational-threadid`

**UUID generation:** `crypto.randomUUID()` — available natively in all modern browsers; no library import needed.

---

### SSR Guard

`sessionStorage` does not exist during Next.js server-side pre-rendering. Any access must be inside a `useEffect` (which only runs in the browser) or guarded with `typeof window !== "undefined"`.

The implementation uses `useState` initialised to `null` plus a `useEffect` that reads/writes sessionStorage and sets the threadId. `<CopilotKit>` is rendered only after the threadId is resolved to avoid a flash of the wrong thread.

---

### File Structure Changes

```
frontend/
└── components/
    └── Providers.tsx    # MODIFY — add sessionStorage threadId logic
```

No other files change.

---

### `components/Providers.tsx` Changes

Add `useState` and `useEffect` imports. On mount, read the threadId from sessionStorage. If absent, generate a new UUID with `crypto.randomUUID()` and write it to sessionStorage. Pass the resolved threadId to `<CopilotKit>`.

```tsx
"use client";

import { useState, useEffect } from "react";
import { CopilotKit } from "@copilotkit/react-core";
import "@copilotkit/react-ui/styles.css";
import { StockDataToolRenderer } from "./StockDataToolRenderer";
import { CompanyOverviewToolRenderer } from "./CompanyOverviewToolRenderer";

const THREAD_ID_KEY = "agentic-interface-conversational-threadid";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [threadId, setThreadId] = useState<string | null>(null);

  useEffect(() => {
    let id = sessionStorage.getItem(THREAD_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(THREAD_ID_KEY, id);
    }
    setThreadId(id);
  }, []);

  if (!threadId) return null;

  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agent="agent"
      threadId={threadId}
      renderToolCalls={[StockDataToolRenderer, CompanyOverviewToolRenderer]}
    >
      {children}
    </CopilotKit>
  );
}
```

**Why a loading skeleton before threadId resolves:** Rendering `<CopilotKit>` without a threadId would cause it to auto-generate a random one on mount — which would then be replaced by the sessionStorage value on the next render, causing a double-initialisation. The component must wait until the threadId is known.

Rather than returning `null` (blank screen), a skeleton matching the page layout is rendered while the threadId resolves. Since `useEffect` runs immediately after hydration, this state is imperceptible in normal use but avoids any layout shift:

```tsx
if (!threadId) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-950">
      <div className="flex-none h-14 border-b border-gray-800 animate-pulse" />
      <div className="flex flex-1 min-h-0">
        <div className="flex-none w-64 border-r border-gray-800" />
        <div className="flex-1 bg-gray-950" />
      </div>
    </div>
  );
}

---

### Acceptance Criteria (Phase 1)

- [x] Refreshing the browser window replays the full conversation history
- [x] Opening a new tab starts a fresh conversation (no shared history with other tabs)
- [x] Closing and reopening the tab starts a fresh conversation
- [x] A layout-matching skeleton is shown during the brief threadId resolution (no blank screen or layout shift)
- [x] Stock price chart and company overview card tool renderers continue to work after refresh (no regression)

---

## Phase 2: Migrate to v2 CopilotKit API (per-page `threadId` and `agentId`)

### Status
Implemented.

### Goals

- Move `threadId` and `agentId` (currently `agent`) from the shared `<CopilotKit>` provider to each `<CopilotChat>` instance, so future pages can independently own their thread and agent selection
- Switch from the v1 compatibility wrapper (`<CopilotKit>` from `@copilotkit/react-core`) to the pure v2 provider (`<CopilotKitProvider>` from `@copilotkit/react-core/v2`)
- Switch from the v1 chat component (`<CopilotChat>` from `@copilotkit/react-ui`) to the v2 chat component (`<CopilotChat>` from `@copilotkit/react-core/v2`)
- No changes to the backend (`route.ts`, `agent.py`, `mcp_server.py`)

---

### Background: v1 vs v2 Architecture

**Previous (v1) flow:**
```
<CopilotKit runtimeUrl="..." agent="agent" threadId={id} renderToolCalls={[...]}>
  <CopilotChat />                    ← from @copilotkit/react-ui
</CopilotKit>
```
`agent` and `threadId` were provider-level globals. Every page shared the same thread and agent. The v1 `<CopilotChat>` read them from internal context.

**Current (v2) flow:**
```
<CopilotKitProvider runtimeUrl="..." showDevConsole={true} renderToolCalls={[...]}>
  <CopilotChat agentId="agent" threadId={id} />   ← from @copilotkit/react-core/v2
</CopilotKitProvider>
```
Each page's `<CopilotChat>` owns its own `agentId` and `threadId`. The provider is a pure runtime connection layer.

---

### Why move from `<CopilotKit>` to `<CopilotKitProvider>`

`CopilotKit` (available from both `@copilotkit/react-core` and re-exported from `@copilotkit/react-core/v2` — same component either way) is a v1 compatibility wrapper. On top of the v2 `CopilotKitProvider`, it adds:

| Added layer | Purpose | Relevant to us? |
|---|---|---|
| `<CopilotErrorBoundary>` | React error boundary. Catches render errors from within CopilotKit components. Only shows a banner when using CopilotKit Cloud (`publicApiKey`), which we don't use. Re-throws non-CopilotKit errors normally. | No — self-hosted, no `publicApiKey`. A custom `<ErrorBoundary>` can be added if desired. |
| `<ThreadsProvider>` | v1 thread context consumed by v1 `<CopilotChat>` | No — v2 `<CopilotChat>` manages its own thread |
| `<ToastProvider>` | Developer toast notifications | No — only active when `showDevConsole: true` |
| `<CopilotKitInternal>` | v1 hook infrastructure (`useCopilotAction`, `useCopilotReadable`, etc.) | No — we don't use any v1 hooks |
| `validateProps` | Guards against invalid prop combinations | Minor — v2 provider docs its own constraints |

None of the added layers are material for our setup. The pure v2 `<CopilotKitProvider>` is the appropriate provider for a fully v2 stack.

**Optional**: After switching, wrap `<CopilotKitProvider>` in a simple custom `<ErrorBoundary>` to preserve the render-error logging behaviour if desired. This is a 10-line class component and is not required for functionality.

---

### API Surface Changes

| Concern | v1 (previous) | v2 (current) |
|---|---|---|
| Provider import | `CopilotKit` from `@copilotkit/react-core` | `CopilotKitProvider` from `@copilotkit/react-core/v2` |
| Provider props | `runtimeUrl`, `agent`, `threadId`, `renderToolCalls` | `runtimeUrl`, `renderToolCalls` |
| Chat import | `CopilotChat` from `@copilotkit/react-ui` | `CopilotChat` from `@copilotkit/react-core/v2` |
| Agent selection | `agent="agent"` on provider (shared) | `agentId="agent"` on `<CopilotChat>` (per-page) |
| Thread control | `threadId` on provider (shared) | `threadId` on `<CopilotChat>` (per-page) |
| `instructions` prop | Present on v1 `<CopilotChat>` | Removed — agent handles its own system prompt via `agent.py` |
| Welcome message | `labels={{ initial: "..." }}` | `labels={{ welcomeMessageText: "..." }}` |
| `className` prop | ✓ | ✓ (unchanged) |
| CSS import | `@copilotkit/react-ui/styles.css` | `@copilotkit/react-core/v2/styles.css` |

---

### File Structure Changes

```
frontend/
├── components/
│   └── Providers.tsx    # MODIFY — simplify to stateless v2 provider wrapper
└── app/
    └── page.tsx         # MODIFY — add sessionStorage threadId, v2 CopilotChat
```

No other files change.

---

### `components/Providers.tsx` Changes

Remove all sessionStorage logic, loading skeleton, `useState`, `useEffect`, and `THREAD_ID_KEY`. Switch provider import and CSS import.

```tsx
"use client";

import { CopilotKitProvider } from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";
import { StockDataToolRenderer } from "./StockDataToolRenderer";
import { CompanyOverviewToolRenderer } from "./CompanyOverviewToolRenderer";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CopilotKitProvider
      runtimeUrl="/api/copilotkit"
      showDevConsole={true}
      renderToolCalls={[StockDataToolRenderer, CompanyOverviewToolRenderer]}
    >
      {children}
    </CopilotKitProvider>
  );
}
```

---

### `app/page.tsx` Changes

Move the sessionStorage threadId logic here. Change `<CopilotChat>` import. The loading skeleton — previously in `Providers.tsx` — moves here, since `<CopilotKitProvider>` now mounts unconditionally and only the page-level chat waits for the threadId.

**Storage key convention:** Keys are scoped by agent type, not by page name. The conversational agent page uses `"agentic-interface-conversational-threadid"`. A future autonomous agent page would use `"agentic-interface-autonomous-threadid"`. This is not yet built or in use — no rename required by this migration.

```tsx
"use client";

import { useState, useEffect } from "react";
import { CopilotChat } from "@copilotkit/react-core/v2";

const THREAD_ID_KEY = "agentic-interface-conversational-threadid";

export default function Home() {
  const [threadId, setThreadId] = useState<string | null>(null);

  useEffect(() => {
    let id = sessionStorage.getItem(THREAD_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(THREAD_ID_KEY, id);
    }
    setThreadId(id);
  }, []);

  if (!threadId) {
    return (
      <div className="flex flex-col h-screen overflow-hidden bg-gray-950">
        <div className="flex-none h-14 border-b border-gray-800 animate-pulse" />
        <div className="flex flex-1 min-h-0">
          <div className="flex-none w-64 border-r border-gray-800" />
          <div className="flex-1 bg-gray-950" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="flex-none h-14 flex items-center px-6 border-b border-gray-800 bg-gray-950">
        <h1 className="text-lg font-semibold text-gray-100">
          Agentic Interface (Proof of concept)
        </h1>
      </header>
      <div className="flex flex-1 min-h-0">
        <aside className="flex-none w-64 border-r border-gray-800 bg-gray-950">
          {/* Sidebar */}
        </aside>
        <main className="flex-1 min-h-0 flex flex-col">
          <CopilotChat
            className="h-full"
            agentId="agent"
            threadId={threadId}
            labels={{
              welcomeMessageText:
                "Hello! I have access to weekly stock price data and company overviews for the Magnificent 7 companies. Try asking me about Apple, Microsoft, Google, Amazon, Meta, Tesla, or Nvidia.",
            }}
          />
        </main>
      </div>
    </div>
  );
}
```

---

### Why `<CopilotKitProvider>` mounts unconditionally

In the Phase 1 implementation, `<CopilotKit>` was gated behind the null-check in `Providers.tsx` (rendered only after threadId resolved). With the v2 split:

- `<CopilotKitProvider>` doesn't need a threadId at all — it's a pure runtime connection layer
- The v2 `<CopilotChat>` only calls `connectAgent` (to replay thread history) when its `threadId` prop is set and `hasExplicitThreadId` is true
- The loading skeleton in `page.tsx` prevents `<CopilotChat>` from mounting until the threadId is known, which is sufficient

`<CopilotKitProvider>` mounting early (during skeleton display) is harmless — it establishes the runtime connection to `/api/copilotkit` but does not start a conversation or load thread history.

---

### Acceptance Criteria (Phase 2)

- [x] `Providers.tsx` contains no sessionStorage, threadId, or agentId logic — it is a stateless provider wrapper
- [x] `page.tsx` owns its threadId lifecycle via sessionStorage (key: `"agentic-interface-conversational-threadid"`)
- [x] Refreshing the browser replays conversation history (Phase 1 criteria preserved under the new storage key)
- [x] Opening a new tab starts a fresh conversation (Phase 1 criteria preserved)
- [x] `agentId="agent"` is set on `<CopilotChat>` in `page.tsx`, not on the provider
- [x] Stock price chart and company overview card tool renderers continue to work (no regression)
- [x] A future page can be added with its own `agentId` and `threadId` without touching `Providers.tsx`
