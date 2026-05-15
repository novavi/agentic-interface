# CopilotKit-based Frontend — Conversational - HITL

## Status
**Blocked** — TOOL_CALL events from run 2 (post-HITL-resume) do not reach the browser. Investigation paused after ~3 sessions. See **Known Issues & Investigation Findings** below.

## Overview

Provides a Human-in-the-Loop frontend for the LangGraph interrupt defined in `langgraph-agent-conversational-hitl.md`. When the agent fires a `tool_selection` interrupt, a shadcn Dialog modal is surfaced in the UI. The user can review the default tool selection, toggle individual tools on or off, and then Approve, Modify, or Reject before the agent proceeds.

No changes to the backend (`route.ts`, `agent.py`, `mcp_server.py`).

---

## Goals

- Display a modal dialog when a `tool_selection` LangGraph interrupt is received
- Show each MCP tool as a labelled toggle (shadcn `Switch`) — enabled by default
- Provide **Reject**, **Modify**, and **Approve** buttons (left to right) at the bottom of the dialog
- Approve uses the original default selection; Modify uses the user's current toggle state; Reject cancels the operation
- ESC key and backdrop click both behave as Reject
- Use shadcn UI components throughout (Dialog, Switch, Button)

---

## Prerequisites: shadcn Installation

**Status: Complete.**

The following commands were run before implementation began.

**Step 1 — Initialise shadcn** (run once per project):
```bash
npx shadcn@latest init
```
Choices made at the prompts:
- Component library: **Radix**
- Preset: **Nova**

This created `components.json`, `lib/utils.ts`, and adjusted `tailwind.config.ts`.

**Step 2 — Add required components**:
```bash
npx shadcn@latest add dialog
npx shadcn@latest add switch
npx shadcn@latest add button
npx shadcn@latest add label
```

Each command created a file under `frontend/components/ui/`. These are local copies — edit freely.

The `add` commands also install shadcn's peer dependencies automatically via npm. These are all expected and require no manual action:

| Package | Why shadcn needs it |
|---|---|
| `class-variance-authority` | Powers component variant system (e.g. `variant="outline"` on Button) |
| `clsx` | Utility for conditionally combining class names |
| `tailwind-merge` | Merges Tailwind classes without conflicts when styles are overridden |
| `lucide-react` | Icon library — used for the ✕ close button on Dialog |
| `@radix-ui/*` | Radix UI primitives the components are built on (chosen at init time) |
| `tw-animate-css` | Animation utilities used by Dialog open/close transitions |

`lib/utils.ts` (also created by shadcn init) exports a `cn()` helper combining `clsx` and `tailwind-merge`, which the generated component files import.

---

## Background: CopilotKit `useInterrupt`

CopilotKit v2 exposes a `useInterrupt` hook (`@copilotkit/react-core/v2`) that subscribes to `on_interrupt` custom events from the agent. When an interrupt fires and the agent run finalises, the hook calls the `render` function and surfaces the returned element.

With `renderInChat: false`, the hook returns the element directly (or `null` when no interrupt is pending) so it can be placed anywhere in the component tree — in this case, as the content of a controlled Dialog.

`resolve(response)` resumes the agent by sending the provided value as the LangGraph `Command(resume=...)` payload.

```tsx
// Simplified shape
useInterrupt({
  renderInChat: false,
  enabled: (event) => event.value?.type === "tool_selection",
  render: ({ event, resolve }) => (
    <ToolSelectionContent event={event} resolve={resolve} />
  ),
});
// Returns React.ReactElement | null
```

---

## UX Design

### Dialog title
`"Confirm Information Request"`

### Dialog body
Opening sentence: *"Before retrieving information for **[company]**, choose which data sources to include:"*

Each tool is displayed as a row:
```
[Tool label]          [Switch — on by default]
```

Tool labels (from the interrupt payload's `label` field):
- `"Stock Price Data"` → `get-stock-data`
- `"Company Overview Data"` → `get-company-overview`

Switches use shadcn's `Switch` component. Labels use shadcn's `Label`, associated via `htmlFor`/`id` for accessibility.

### Buttons (left to right)

| Position | Button | Variant | Action |
|---|---|---|---|
| Left | **Reject** | Destructive / ghost | Sends `{ action: "reject", enabled_tools: [] }`. Agent responds with polite acknowledgement. |
| Centre | **Modify** | Secondary / outline | Sends `{ action: "modify", enabled_tools: [...currently enabled] }`. Disabled when no tools are toggled on (cannot submit an empty selection via Modify — see edge case below). |
| Right | **Approve** | Primary | Sends `{ action: "approve", enabled_tools: [...all tools from payload] }`. Ignores any toggle changes the user may have made. |

**Left-to-right rationale**: Reject (destructive) on the left, primary action (Approve) on the right — follows standard dialog conventions (macOS, Material, web). Modify sits in the middle as a secondary action.

### Edge case: all tools disabled
If the user disables all tool toggles, the Modify button is disabled. A brief helper text is shown below the switches: *"Enable at least one data source to use Modify, or click Reject to cancel."* Approve remains available and always uses the full default selection regardless of toggle state.

### ESC key and backdrop click
Both map to Reject. shadcn's Dialog `onEscapeKeyDown` and `onInteractOutside` are intercepted to call the same reject handler instead of silently dismissing.

---

## File Structure Changes

```
frontend/
├── components/
│   ├── ui/                          # CREATED BY shadcn CLI — do not edit filenames
│   │   ├── dialog.tsx
│   │   ├── switch.tsx
│   │   ├── button.tsx
│   │   └── label.tsx
│   └── ToolSelectionDialog.tsx      # NEW — the HITL dialog component
├── app/
│   └── page.tsx                     # MODIFY — add useInterrupt and dialog rendering
└── lib/
    └── utils.ts                     # CREATED BY shadcn CLI
```

---

## `components/ToolSelectionDialog.tsx`

Receives the interrupt event and `resolve` from `useInterrupt`. Manages the local toggle state independently of the Approve path (Approve always sends the full default list).

```tsx
"use client";

import { useState } from "react";
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Tool = { id: string; label: string; enabled: boolean };

interface Props {
  company: string;
  tools: Tool[];
  resolve: (response: unknown) => void;
}

export function ToolSelectionDialog({ company, tools, resolve }: Props) {
  const [toggleState, setToggleState] = useState<Record<string, boolean>>(
    Object.fromEntries(tools.map((t) => [t.id, t.enabled])),
  );

  const allToolIds = tools.map((t) => t.id);
  const enabledIds = Object.entries(toggleState)
    .filter(([, on]) => on)
    .map(([id]) => id);
  const noneEnabled = enabledIds.length === 0;

  const handleApprove = () =>
    resolve({ action: "approve", enabled_tools: allToolIds });

  const handleModify = () =>
    resolve({ action: "modify", enabled_tools: enabledIds });

  const handleReject = () =>
    resolve({ action: "reject", enabled_tools: [] });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Confirm Information Request</DialogTitle>
        <DialogDescription>
          Before retrieving information for <strong>{company}</strong>, choose
          which data sources to include:
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4 py-4">
        {tools.map((tool) => (
          <div key={tool.id} className="flex items-center justify-between">
            <Label htmlFor={tool.id} className="text-sm font-medium">
              {tool.label}
            </Label>
            <Switch
              id={tool.id}
              checked={toggleState[tool.id]}
              onCheckedChange={(checked) =>
                setToggleState((prev) => ({ ...prev, [tool.id]: checked }))
              }
            />
          </div>
        ))}
        {noneEnabled && (
          <p className="text-xs text-muted-foreground">
            Enable at least one data source to use Modify, or click Reject to
            cancel.
          </p>
        )}
      </div>

      <DialogFooter className="flex-row justify-between sm:justify-between">
        <Button variant="ghost" onClick={handleReject}>
          Reject
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleModify}
            disabled={noneEnabled}
          >
            Modify
          </Button>
          <Button onClick={handleApprove}>Approve</Button>
        </div>
      </DialogFooter>
    </>
  );
}
```

**Note on DialogFooter layout**: Reject is pinned to the left; Modify and Approve are grouped on the right. This keeps the destructive action visually separated from the two confirmatory actions, which is standard for dialogs with a reject/cancel option.

---

## `app/page.tsx` Changes

Add `useInterrupt` from `@copilotkit/react-core/v2` and mount the Dialog. The Dialog is open when the interrupt element is non-null. ESC and backdrop click are overridden to call `handleReject`.

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { CopilotChat, useInterrupt } from "@copilotkit/react-core/v2";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ToolSelectionDialog } from "@/components/ToolSelectionDialog";

const THREAD_ID_KEY = "agentic-interface-conversational-threadid";

type ToolSelectionPayload = {
  type: string;
  company: string;
  tools: { id: string; label: string; enabled: boolean }[];
};

function ConversationalPage() {
  const rejectRef = useRef<(() => void) | null>(null);

  const interruptElement = useInterrupt({
    renderInChat: false,
    enabled: (event) =>
      (event.value as ToolSelectionPayload)?.type === "tool_selection",
    render: ({ event, resolve }) => {
      const payload = event.value as ToolSelectionPayload;
      // Capture reject handler so ESC/backdrop can call it
      rejectRef.current = () =>
        resolve({ action: "reject", enabled_tools: [] });

      return (
        <ToolSelectionDialog
          company={payload.company}
          tools={payload.tools}
          resolve={resolve}
        />
      );
    },
  });

  const handleReject = () => rejectRef.current?.();

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
            threadId={/* threadId from sessionStorage */undefined}
            labels={{
              welcomeMessageText:
                "Hello! I have access to weekly stock price data and company overviews for the Magnificent 7 companies. Try asking me about Apple, Microsoft, Google, Amazon, Meta, Tesla, or Nvidia. You can say 'Get stock price for Apple' and 'Get overview of Microsoft'. You can also say 'Get info for Google' to choose which data sources to include before I respond.",
            }}
          />
        </main>
      </div>

      <Dialog
        open={interruptElement !== null}
        onOpenChange={() => {}}
      >
        <DialogContent
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            handleReject();
          }}
          onInteractOutside={(e) => {
            e.preventDefault();
            handleReject();
          }}
        >
          {interruptElement}
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

**Implementation note**: `useInterrupt` must be called inside the `<CopilotKitProvider>` tree. Since `page.tsx` is already inside `<CopilotKitProvider>` (via `Providers.tsx`), this works. However, `useInterrupt` also requires being inside a `<CopilotChat>`'s agent context — if this causes issues, extract `ConversationalPage` into a child component rendered under `<CopilotChat>` or use the `agentId` config option on `useInterrupt`.

**On the `onOpenChange={() => {}}` pattern**: Passing an empty handler prevents shadcn's Dialog from closing on its own (e.g. if an unhandled keyboard event propagates). All close paths are explicit: ESC → `onEscapeKeyDown` → reject; backdrop → `onInteractOutside` → reject; buttons → `resolve()` → `pendingEvent` clears → `interruptElement` becomes null → Dialog closes naturally.

---

## Full `app/page.tsx`

The complete file, incorporating the sessionStorage threadId logic from Phase 1/Phase 2 of `copilotkit-frontend-functionality.md`:

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { CopilotChat, useInterrupt } from "@copilotkit/react-core/v2";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ToolSelectionDialog } from "@/components/ToolSelectionDialog";

const THREAD_ID_KEY = "agentic-interface-conversational-threadid";

type ToolSelectionPayload = {
  type: string;
  company: string;
  tools: { id: string; label: string; enabled: boolean }[];
};

export default function Home() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const rejectRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let id = sessionStorage.getItem(THREAD_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(THREAD_ID_KEY, id);
    }
    setThreadId(id);
  }, []);

  const interruptElement = useInterrupt({
    renderInChat: false,
    enabled: (event) =>
      (event.value as ToolSelectionPayload)?.type === "tool_selection",
    render: ({ event, resolve }) => {
      const payload = event.value as ToolSelectionPayload;
      rejectRef.current = () =>
        resolve({ action: "reject", enabled_tools: [] });
      return (
        <ToolSelectionDialog
          company={payload.company}
          tools={payload.tools}
          resolve={resolve}
        />
      );
    },
  });

  const handleReject = () => rejectRef.current?.();

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
          {/* Sidebar — to be fleshed out as a navbar in a later plan */}
        </aside>
        <main className="flex-1 min-h-0 flex flex-col">
          <CopilotChat
            className="h-full"
            agentId="agent"
            threadId={threadId}
            labels={{
              welcomeMessageText:
                "Hello! I have access to weekly stock price data and company overviews for the Magnificent 7 companies. Try asking me about Apple, Microsoft, Google, Amazon, Meta, Tesla, or Nvidia. You can say 'Get stock price for Apple' and 'Get overview of Microsoft'. You can also say 'Get info for Google' to choose which data sources to include before I respond.",
            }}
          />
        </main>
      </div>

      <Dialog open={interruptElement !== null} onOpenChange={() => {}}>
        <DialogContent
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            handleReject();
          }}
          onInteractOutside={(e) => {
            e.preventDefault();
            handleReject();
          }}
        >
          {interruptElement}
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

---

## Open Questions (to resolve before implementation)

1. **`useInterrupt` placement**: If calling `useInterrupt` directly in `page.tsx` (outside `<CopilotChat>`) causes agent context issues, the hook may need to be called in a child component rendered after `<CopilotChat>` mounts. Verify during implementation.

---

## Acceptance Criteria

- [x] shadcn Dialog, Switch, Button, and Label components are installed and available under `components/ui/`
- [ ] When a `tool_selection` interrupt fires, the dialog appears with the correct company name in the title/body
- [ ] Both tools are shown with toggle switches, both on by default
- [ ] Toggling a switch updates the visual state immediately
- [ ] **Approve** resolves the interrupt with all tools enabled (ignores toggle state)
- [ ] **Modify** resolves with only the currently enabled tools; is disabled when no tools are toggled on
- [ ] **Reject** resolves with `action: "reject"`; agent responds with a polite acknowledgement message
- [ ] Pressing ESC while the dialog is open behaves as Reject
- [ ] Clicking the backdrop while the dialog is open behaves as Reject
- [ ] After any resolution, the dialog closes and the chat input is usable again
- [ ] All existing Phase 1 and Phase 2 functionality (history persistence, tool renderers) continues to work — no regression

---

## Revert to v1 — Remediation Plan

### Context

The v2 import approach (`@copilotkit/react-core/v2`) was attempted but proved incompatible with the interrupt resume flow — the v1 `useLangGraphInterrupt` hook is the correct mechanism for LangGraph interrupts, and the mix of v2 `CopilotChat` with a manually managed `threadId` causes a "Message not found" error on resume (the agent runtime misidentifies the run as needing regeneration rather than resumption). Additionally, tool rendering is completely broken in the current v2 state.

This section replaces the v2 approach with a clean v1 implementation, sequenced in three steps.

**Files left in place from the v2 attempt** (do not delete — may be useful for reference):
- `components/ToolSelectionDialog.tsx` — kept as-is

---

### Step 1 — Import paths and component structure

**Goal**: Get a working chat again (even without tool rendering or HITL) using only v1 imports.

**`app/page.tsx` changes**:
- Import `CopilotKit` and `CopilotChat` from `@copilotkit/react-core` (not `/v2`)
- Remove `CopilotChatConfigurationProvider` (v2 concept — no longer needed)
- Remove the `ChatContent` wrapper component
- Move `<CopilotChat>` directly into `Home`, inside `<CopilotKit>`
- `CopilotKit` takes `runtimeUrl="/api/copilotkit"` and `agent="agent"` — this sets the agent context for all child hooks; `CopilotChat` does **not** take an `agentId` prop in v1
- Keep `threadId` on `CopilotChat` for session persistence
- Keep the `useState`/`useEffect` sessionStorage logic and the loading skeleton

Resulting structure inside `Home`:

```tsx
<CopilotKit runtimeUrl="/api/copilotkit" agent="agent">
  {/* Step 2: <ToolRenderer /> goes here */}
  {/* Step 3: <LangGraphInterruptHandler threadId={threadId} /> goes here */}
  <CopilotChat
    className="h-full"
    threadId={threadId}
    labels={{ welcomeMessageText: "..." }}
  />
</CopilotKit>
```

**Imports after this step**:
```tsx
import { CopilotKit, CopilotChat } from "@copilotkit/react-core";
```

---

### Step 2 — Restore tool rendering

**Goal**: Restore the stock chart and company overview card renderers, which are broken in the current v2 state.

**New file**: `components/ToolRenderer.tsx`

A component that lives inside `<CopilotKit>` and registers renderers for each tool via `useDefaultTool`. The `render` callback receives the tool call (including `name`), switches on `name`, and returns the appropriate renderer component.

```tsx
function ToolRenderer() {
  useDefaultTool({
    render: ({ name, args, result }) => {
      switch (name) {
        case "get-stock-data":
          return <StockChart data={result} />;
        case "get-company-overview":
          return <CompanyOverviewCard data={result} />;
        default:
          return null;
      }
    },
  });
  return null;
}
```

`ToolRenderer` returns `null` — it exists only to register the hook. It is placed inside `<CopilotKit>` above `<LangGraphInterruptHandler>` and `<CopilotChat>`.

---

### Step 3 — Add HITL interrupt handling

**Goal**: Restore the HITL dialog using a new `InterruptModal` component and a `LangGraphInterruptHandler` that wires it up.

#### New file: `components/InterruptModal.tsx`

A self-contained modal using shadcn `Dialog`. Receives `isOpen`, `data`, `onResponse`, and `onClose` as props — no CopilotKit dependency. Uses `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `Switch`, `Button`, `Label` from shadcn.

```tsx
interface InterruptModalProps {
  isOpen: boolean;
  data: ToolSelectionPayload | null;
  onResponse: (response: { action: string; enabled_tools: string[] }) => void;
  onClose: () => void;
}
```

Internally manages toggle state. `onClose` is wired to ESC (`onEscapeKeyDown`) and backdrop click (`onInteractOutside`) — both behave as Reject. Button behaviour matches the existing UX design (Approve / Modify / Reject).

#### New component: `LangGraphInterruptHandler`

Lives in `app/page.tsx`. Must be a child of `<CopilotKit>` (so `useLangGraphInterrupt` has context). Accepts `threadId` as a prop. Manages modal open state and the resolve reference internally.

```tsx
function LangGraphInterruptHandler({ threadId }: { threadId: string }) {
  const [modalData, setModalData] = useState<ToolSelectionPayload | null>(null);
  const resolveRef = useRef<((value: string) => void) | null>(null);

  useLangGraphInterrupt<ToolSelectionPayload>({
    enabled: ({ eventValue }) => eventValue?.type === "tool_selection",
    render: ({ event, resolve }) => {
      resolveRef.current = resolve;
      setModalData(event.value as ToolSelectionPayload);
      return null;
    },
  });

  const handleResponse = (response: { action: string; enabled_tools: string[] }) => {
    resolveRef.current?.(JSON.stringify(response));
    setModalData(null);
  };

  const handleClose = () => {
    resolveRef.current?.(JSON.stringify({ action: "reject", enabled_tools: [] }));
    setModalData(null);
  };

  return (
    <InterruptModal
      isOpen={modalData !== null}
      data={modalData}
      onResponse={handleResponse}
      onClose={handleClose}
    />
  );
}
```

**Note on `render` returning `null`**: `useLangGraphInterrupt`'s `render` callback controls what appears inline in the chat stream. Returning `null` means nothing appears inline — the modal (rendered by `LangGraphInterruptHandler` itself, outside the chat) handles the UI instead. The `setModalData` call triggers the modal to open via state.

**Note on `setModalData` inside `render`**: This is a state setter called from within a render prop, which can cause a React warning about state updates during render. Wrap in `useEffect` or `setTimeout(fn, 0)` if this occurs.

#### Final structure inside `Home`:

```tsx
<CopilotKit runtimeUrl="/api/copilotkit" agent="agent">
  <ToolRenderer />
  <LangGraphInterruptHandler threadId={threadId} />
  <CopilotChat
    className="h-full"
    threadId={threadId}
    labels={{ welcomeMessageText: "..." }}
  />
</CopilotKit>
```

---

## Known Issues & Investigation Findings

### What works

- **Server side is healthy**: confirmed via LangGraph terminal logs. For a `get info for xxx` prompt, run 2 correctly:
  - Executes `inject_tool_calls_node` → `tools_node` for both `get-stock-data` and `get-company-overview`
  - Calls both MCP tools and gets results
  - Calls the LLM in `respond_node` with all 4 messages (2× AIMessage tool_calls + 2× ToolMessage results)
  - LLM returns a 200 OK response
  - `Background run succeeded` in under 7 seconds
- **HITL interrupt and resume**: `useLangGraphInterrupt` fires correctly, modal appears, user approval triggers run 2
- **Single-tool prompts** (`get stock price for X`, `get overview of X`): these route through `agent_subgraph` (the inner `create_agent` graph), not the HITL path — their tool calls reach the frontend normally

### The blocking problem

After the user approves the HITL modal, run 2 starts an SSE stream from the server. The SSE connection **closes after event 36** (TOOL_CALL_END for `get-stock-data`), before event 37 (TOOL_CALL_START for `get-company-overview`). The browser stops receiving events mid-stream. The server confirms it sends all events successfully — the abort is purely client-side.

### What was investigated (CopilotKit internals)

The relevant client-side pipeline for run 2:

1. `useInterrupt.resolve()` calls `copilotkit.runAgent()` (fire-and-forget, not awaited)
2. `CopilotKitCore.runAgent()` calls `await agent.detachActiveRun()` then `agent.runAgent()`
3. `HttpAgent.runAgent()` creates a **new** `AbortController` for the SSE fetch
4. `ProxiedCopilotRuntimeAgent.#runViaHttp()` uses `createSingleRouteRequestInit` → posts to `/api/copilotkit` with `signal: this.abortController.signal`
5. The SSE response is read via `runHttpRequest` → `transformHttpEventStream` → `verifyEvents` → `takeUntil(activeRunDetach$)` → `apply`

**Key findings:**
- `ProxiedCopilotRuntimeAgent.abortRun()` does **not** call `this.abortController.abort()` — it sends a server-side stop HTTP request instead. So `agent.abortRun()` does not abort the SSE fetch.
- The `connectEffect` cleanup in CopilotChat (`connectAbortController.abort()`) only aborts the agent it was set on **during setup** — by run 2, `agent.abortController` has been replaced by `HttpAgent.runAgent()`, so the cleanup cannot abort run 2's fetch.
- `detachActiveRun()` fires `activeRunDetach$.next()` (cancelling the RxJS pipeline via `takeUntil`) but does not abort the HTTP connection.
- `transformHttpEventStream` **eagerly subscribes** to `runHttpRequest` and pushes events into a Subject. Even if the RxJS pipeline above it is cancelled by `takeUntil`, the inner HTTP subscription continues — so the connection stays open.
- The only thing that can actually abort run 2's SSE fetch is something calling `agent.abortController.abort()` directly. No automated code path was identified that does this.

**Root cause: not conclusively identified.** The strongest remaining hypothesis is a React re-render cycle: if the CopilotChat `useEffect([resolvedThreadId, agent, resolvedAgentId, hasExplicitThreadId])` cleanup fires and re-runs during run 2, the new setup's `agent.abortController = connectAbortController` races with `HttpAgent.runAgent()`'s `this.abortController = new AbortController`. The diagnostic log `[CK-DBG connectEffect]` was added to `copilotkit-DjxXMYHG.mjs` to observe this — but the flow was not reproduced after the log was added.

**Debug instrumentation added to `node_modules`** (must be cleaned up before shipping):
- `[CK-DBG connectEffect]` — `@copilotkit/react-core/dist/copilotkit-DjxXMYHG.mjs` (added to `useEffect` setup and cleanup)
- `[AGUI-DBG verifyEvents]` — `@ag-ui/client/dist/index.js` and `index.mjs`
- `[InMemory-DBG onEvent]` — `@copilotkit/runtime/dist/v2/runtime/runner/in-memory.mjs`
- `[CK DBG dispatchEvent]` — `@copilotkit/runtime/dist/lib/runtime/agent-integrations/langgraph/agent.mjs`
- `[AGUI DBG OnToolEnd]` — `@ag-ui/langgraph/dist/index.js`

### Simpler alternative approach (not yet tried)

The `inject_tool_calls_node` → `tools_node` chain exists to make LangGraph emit real TOOL_CALL SSE events. This is what causes the complexity — those events must survive the full SSE pipeline to the browser.

A simpler alternative: **execute the MCP tools directly in `respond_node` and use `copilotkit_emit_tool_call()` to notify the frontend**.

The CopilotKit Python SDK has `copilotkit_emit_tool_call(config, name=..., args=...)` which dispatches a `copilotkit_manually_emit_tool_call` custom event. The frontend runtime in `agent.mjs` intercepts this and synthesises TOOL_CALL_START/ARGS/END events — triggering the `defineToolCallRenderer` without any real LangGraph tool call flow.

This would simplify the graph to:
```
START → route_node → interrupt_node → respond_node → END
      ↘ agent_subgraph → END
```
(Remove `inject_tool_calls_node` and `tools_node` entirely.)

**The catch**: the current `StockDataToolRenderer` and `CompanyOverviewToolRenderer` render on `ToolCallStatus.Complete` using `result` (the TOOL_CALL_RESULT payload), not `args`. The `copilotkit_emit_tool_call` API only emits START/ARGS/END — no RESULT event. To use this approach, either:
1. Pass the full tool result as the `args` dict to `copilotkit_emit_tool_call` and update the renderers to read from `args` instead of `result`; or
2. Find whether CopilotKit has a way to also emit a TOOL_CALL_RESULT via a custom event

Option 1 is straightforward and removes the dependency on the broken TOOL_CALL SSE pipeline entirely.
