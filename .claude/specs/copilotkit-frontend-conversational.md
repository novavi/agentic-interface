# CopilotKit-based Frontend — Conversational

## Status
Phase 1: Implemented
Phase 2: Implemented

## Overview

Flesh out the existing `frontend/` Next.js skeleton into a functional dark-themed chat UI using CopilotKit. The page layout consists of a fixed header, a left-hand placeholder sidebar (full height, to be fleshed out as a navbar in a later plan), and a scrollable CopilotChat area occupying the remaining width and height. Responses stream from the LangGraph `agent-convo` agent → Next.js API route → browser.

---

## Phase 1: Chat UI + CopilotKit wiring

### Goals

- Install CopilotKit npm packages into `frontend/`
- Create `/api/copilotkit` route connecting CopilotRuntime to the LangGraph dev server
- Implement the page layout: fixed header + sidebar placeholder + full-height scrollable chat
- Apply dark theme throughout (app + CopilotKit chat UI)
- Add `frontend/.env.local` for the LangGraph agent URL (gitignored); commit `.env.local.example` as template
- Update root `.gitignore` to allow the example env file through

---

### npm Packages

```bash
npm install @copilotkit/react-core @copilotkit/react-ui @copilotkit/runtime
```

Confirmed latest versions (May 2026): all three packages at `1.57.1` — CopilotKit packages are versioned in lockstep.

---

### Environment Variables

**`frontend/.env.local`** (gitignored — not committed):
```dotenv
LANGGRAPH_AGENT_CONVO_URL=http://localhost:2024
```

**`frontend/.env.local.example`** (committed template):
```dotenv
LANGGRAPH_AGENT_CONVO_URL=http://localhost:2024
```

`LANGGRAPH_AGENT_CONVO_URL` is server-side only (used in the API route). No `NEXT_PUBLIC_` prefix needed. The value in `.env.local.example` can be the actual default since `localhost:2024` is not a secret.

**Root `.gitignore` change required:** `frontend/.env*` currently blocks all env files including the example. Add a negation rule:
```gitignore
frontend/.env*
!frontend/.env.local.example
```

---

### File Structure Changes

```
frontend/
├── app/
│   ├── api/
│   │   └── copilotkit/
│   │       └── route.ts        # NEW — CopilotRuntime + LangGraph wiring
│   ├── layout.tsx              # MODIFY — import Providers + dark theme shell
│   ├── page.tsx                # MODIFY — full layout: header + sidebar + chat ("use client")
│   └── globals.css             # MODIFY — dark theme base styles + CopilotKit overrides
├── components/
│   └── Providers.tsx           # NEW — "use client" wrapper for CopilotKit provider
├── .env.local                  # NEW — gitignored, real values
└── .env.local.example          # NEW — committed template
```

---

### File Descriptions

#### `app/api/copilotkit/route.ts`

The CopilotRuntime API route. Handles POST requests from the frontend CopilotKit provider and proxies them to the LangGraph dev server as a streaming AG-UI session.

Key points:
- Imports `CopilotRuntime`, `ExperimentalEmptyAdapter`, and `copilotRuntimeNextJSAppRouterEndpoint` from `@copilotkit/runtime`
- Imports `LangGraphAgent` from `@copilotkit/runtime/langgraph` (subpath export — the re-export from the main package is deprecated)
- Reads `LANGGRAPH_AGENT_CONVO_URL` from `process.env`, trims whitespace, falls back to `http://localhost:2024`
- Instantiates `CopilotRuntime` with the `agents` option (a record keyed by agent name):
  ```typescript
  agents: {
    agent: new LangGraphAgent({
      deploymentUrl: agentUrl,  // the trimmed env var value
      graphId: "agent",         // must match the graph key in agent-convo/langgraph.json
    }),
  }
  ```
- Uses `ExperimentalEmptyAdapter` as the `serviceAdapter` — the LLM is called inside the LangGraph agent, not by the route itself, so the route needs no OpenAI key
- Exports `POST` via `copilotRuntimeNextJSAppRouterEndpoint`
- Endpoint path: `"/api/copilotkit"`

> **API change (v1.57.1):** `remoteEndpoints` with `langGraphPlatformEndpoint` is deprecated and throws at startup. The replacement is the `agents` record with `LangGraphAgent` from the `/langgraph` subpath export.

#### `components/Providers.tsx`

A thin `"use client"` wrapper that holds the `CopilotKit` React context provider. Keeping this separate from `layout.tsx` follows Next.js App Router best practice — it allows `layout.tsx` to remain a server component while still providing client-side context to the tree.

- Marked `"use client"` at the top
- Imports `CopilotKit` from `@copilotkit/react-core`
- Imports `@copilotkit/react-ui/styles.css`
- Props: accepts `children: React.ReactNode`
- `CopilotKit` props:
  - `runtimeUrl="/api/copilotkit"`
  - `agent="agent"` (matches the key in the route's `CopilotRuntime` agents map)

#### `app/layout.tsx`

Remains a server component. Sets up the dark theme HTML shell and imports `Providers`.

- Adds `dark` class to `<html>` element for Tailwind dark mode
- Sets dark background on `<body>` (`bg-gray-950` or equivalent)
- Wraps `{children}` with `<Providers>`
- Font: the Next.js skeleton already uses Geist (via `next/font`) — no changes needed

#### `app/page.tsx`

Marked `"use client"` (required because `CopilotChat` uses React hooks). Full-page layout using Tailwind flexbox:

```
┌─────────────────────────────────────────────┐  ← h-screen, flex-col
│  Header (flex-none, ~h-14)                  │
│  "Agentic Interface (Proof of concept)"     │
├──────────────┬──────────────────────────────┤  ← flex-1, flex-row, min-h-0
│              │                              │
│   Sidebar    │      CopilotChat             │
│ placeholder  │      (flex-1, h-full)        │
│  (flex-none, │                              │
│   ~w-64)     │  ← scrollable message area  │
│              │  ← fixed input at bottom     │
└──────────────┴──────────────────────────────┘
```

Key Tailwind structure:
- Outer `div`: `flex flex-col h-screen overflow-hidden`
- `header`: `flex-none` — contains `<h1>` with app title (sensible heading level, appropriate font size, dark-themed)
- Content row `div`: `flex flex-1 min-h-0` — the `min-h-0` is critical to prevent flex children overflowing
- Sidebar `aside`: `flex-none w-64` with a visible border — empty for now with a placeholder comment
- Chat `main`: `flex-1 min-h-0 flex flex-col` — `CopilotChat` inside with `className="h-full"`

`CopilotChat` props:
- `className="h-full"` — fills the chat column
- `instructions` — brief system prompt (e.g. "You are a helpful assistant with access to stock price data for the Magnificent 7 companies.")
- `labels.initial` — welcome message shown before first user message

#### `app/globals.css`

- Existing Tailwind base styles remain
- Add dark background defaults on `:root` / `body` if not already set
- Add CopilotKit CSS variable overrides for dark theme. CopilotKit exposes CSS custom properties (e.g. `--copilot-kit-background-color`, `--copilot-kit-primary-color`) that can be overridden to match the dark theme. Exact variable names to be confirmed against the installed stylesheet during implementation.

---

### Comms Flow

```
Browser (CopilotChat)
  │  POST /api/copilotkit  (streaming SSE)
  ▼
Next.js API route (CopilotRuntime)
  │  AG-UI protocol over HTTP
  ▼
LangGraph dev server (http://localhost:2024)
  │  graph: "agent" in agent-convo/
  ▼
LangGraph ReAct agent → MCP tool (get-stock-data) → response
  ▲
  └── streams back up the chain to the browser
```

---

### Root `.gitignore` Update

Add below the existing `frontend/.env*` line:

```gitignore
!frontend/.env.local.example
```

This negation allows the committed template through while keeping all real env files ignored.

---

### README Update

Add a `## Frontend` section to `README.md` after the existing `## Agent - Conversational` section (both sit under the `# Install, Build and Run` heading):

~~~markdown
## Frontend

A chat UI built with Next.js and CopilotKit, connecting to the Agent - Conversational LangGraph agent.

```bash
cd frontend
cp .env.local.example .env.local   # already pre-filled with localhost default
npm install
npm run dev                         # starts on http://localhost:3000
```
~~~

> Note: `uv run langgraph dev` (agent-convo) must be running before starting the frontend so the `/api/copilotkit` route can reach the agent.

---

### Implementation Notes

- **`LangGraphAgent` import path** — must be imported from `@copilotkit/runtime/langgraph` (subpath export). The re-export from `@copilotkit/runtime` main entry is deprecated and logs a warning; `remoteEndpoints` with `langGraphPlatformEndpoint` throws at startup in v1.57.1.
- **Service adapter** — `ExperimentalEmptyAdapter` from `@copilotkit/runtime` is the correct no-op adapter. All LLM calls happen inside the LangGraph agent; the route needs no OpenAI key.
- **CopilotKit dark theme** — CSS variable overrides in `globals.css` (e.g. `--copilot-kit-background-color`) are the correct approach. No built-in `darkMode` prop exists.
- **`min-h-0` on flex containers** — required at each level of the flex hierarchy to allow inner content to scroll rather than overflow. A common Tailwind gotcha.

---

### Acceptance Criteria (Phase 1)

- [x] `npm install` completes without errors
- [x] `npm run dev` starts without errors
- [x] Page renders at `http://localhost:3000` with dark background
- [x] Header is always visible at the top with the correct title
- [x] Sidebar placeholder is visible on the left at a fixed width
- [x] CopilotChat occupies the remaining width and full height below the header
- [x] Message area scrolls; input box stays fixed at the bottom
- [x] Sending "get stock price for apple" returns the 12 monthly data points (requires agent-convo running)
- [x] Responses stream visibly (tokens appear progressively, not all at once)
- [x] `.env.local` is not committed; `.env.local.example` is

---

## Phase 2: Backend Tool Renderer — Stock Price Chart

### Goals

- Install Highcharts npm packages into `frontend/`
- Create a `StockPriceChart` React component that renders closing prices as a Highcharts line chart with a dark theme
- Define a CopilotKit tool call renderer for `get-stock-data` using `defineToolCallRenderer`
- Wire the renderer into `Providers.tsx` via the `renderToolCalls` prop on `<CopilotKit>`
- When the agent calls `get-stock-data`, the chat UI renders the chart instead of dumping JSON text

---

### npm Packages

```bash
npm install highcharts highcharts-react-official zod
```

- `highcharts` — core charting library
- `highcharts-react-official` — official React wrapper for Highcharts
- `zod` — schema library for `defineToolCallRenderer`'s `args` type; installed as a direct dep for explicitness (CopilotKit already depends on it transitively at v4.x)

---

### CopilotKit Tool Renderer API (v1.57.1)

The v2 tool renderer API works as follows:

- **`defineToolCallRenderer`** — helper from `@copilotkit/react-core/v2` (subpath export); accepts `{ name, args, render, agentId? }` and returns a `ReactToolCallRenderer` object. The main `@copilotkit/react-core` entry point side-effect-imports this for runtime use only and does not re-export it in TypeScript types.
  - `name` — the exact MCP/tool name to intercept: `"get-stock-data"`
  - `args` — a Standard Schema V1 compatible schema (zod works); used for TypeScript inference of `args` in the render component
  - `render` — a React component (`React.ComponentType`) receiving `{ name, toolCallId, args, status, result }`
    - `args` — the (partially) streamed tool arguments, typed from the schema
    - `status` — `ToolCallStatus` enum: `InProgress` (args streaming), `Executing` (tool running server-side), `Complete` (result available)
    - `result` — a JSON string when `status === Complete`; needs `JSON.parse` to use
- **`renderToolCalls`** — prop on `<CopilotKit>` accepting an array of `ReactToolCallRenderer` objects
- **`ToolCallStatus`** — enum from `@copilotkit/core` (transitive dep of `@copilotkit/react-core`); values: `InProgress`, `Executing`, `Complete`

---

### File Structure Changes

```
frontend/
├── components/
│   ├── StockPriceChart.tsx         # NEW — "use client" Highcharts chart component
│   ├── StockDataToolRenderer.tsx   # NEW — defineToolCallRenderer definition (JSX render fn)
│   └── Providers.tsx               # MODIFY — add renderToolCalls prop to <CopilotKit>
```

---

### File Descriptions

#### `components/StockPriceChart.tsx`

A `"use client"` React component that receives focused chart props and renders the Highcharts line chart. Status branching and result parsing happen upstream in the `StockDataToolRenderer.tsx` render function; this component only renders the chart (or the loading indicator if not yet mounted).

Props:
```typescript
interface StockPriceChartProps {
  company: string
  ticker: string
  data: { month: string; price: number }[]
}
```

The `StockDataToolRenderer` render function handles:
- `InProgress` / `Executing` → renders an inline loading paragraph (does not mount `StockPriceChart` at all)
- `Complete` → parses `result`, checks for an error field, then mounts `StockPriceChart` with the extracted fields

**SSR guard:** Highcharts accesses `window` at import time. In Next.js App Router, `"use client"` components are still pre-rendered on the server by default. Guard the chart render with a mounted state:
```typescript
const [mounted, setMounted] = useState(false)
useEffect(() => setMounted(true), [])
if (!mounted) return <LoadingState />
```
Only render `<HighchartsReact>` after `mounted` is true.

**Highcharts config (dark theme):**

| Option | Value | Rationale |
|---|---|---|
| `chart.height` | `350` | explicit pixel height — Highcharts owns its dimensions rather than inheriting from a CSS container; avoids x-axis clipping inside the chat message bubble |
| `chart.backgroundColor` | `'#030712'` | matches `bg-gray-950` app background |
| `chart.style.fontFamily` | `'inherit'` | inherits Geist from the page |
| `title.text` | `"{company} ({ticker})"` | populated from parsed result |
| `title.style.color` | `'#f9fafb'` | gray-50 — high contrast on dark bg |
| `xAxis.type` | `'datetime'` | Highcharts handles datetime tick spacing |
| xAxis x values | `Date.UTC(year, month - 1, 1)` | `"YYYY-MM"` → split on `'-'` → `Date.UTC(y, m-1, 1)` |
| `xAxis` labels/grid | `color: '#9ca3af'`, `gridLineColor: '#1f2937'` | gray-400 / gray-800 |
| `yAxis.title.text` | `'Price (USD)'` | currency communicated via axis title — no `$` prefix on labels |
| `yAxis.labels.style.color` | `'#9ca3af'` | gray-400; no format override (Highcharts default numeric formatting) |
| `yAxis.gridLineColor` | `'#1f2937'` | gray-800 |
| `series[0].type` | `'line'` | clean line chart for time series |
| `series[0].name` | ticker symbol | populated from parsed result |
| `series[0].color` | `'#3b82f6'` | blue-500 — visible on dark bg |
| `series[0].data` | `[[timestamp, price], ...]` | Highcharts datetime series format |
| `tooltip.backgroundColor` | `'#111827'` | gray-900 |
| `tooltip.style.color` | `'#f9fafb'` | |
| `tooltip.valuePrefix` | `'$'` | tooltip shows `$` prefix inline — distinct from the axis label context |
| `legend.itemStyle.color` | `'#9ca3af'` | gray-400 |
| `credits.enabled` | `false` | removes Highcharts.com link |

#### `components/StockDataToolRenderer.tsx`

A `.tsx` module (JSX needed — the `render` function returns JSX inline). Exports the renderer object created by `defineToolCallRenderer`.

The `render` prop is typed as `(props: RenderProps<T>) => React.ReactElement` (a plain function, not a `React.ComponentType`), so branching on `status` and delegating to `StockPriceChart` happens inside an inline render function. `result` is typed as `string` only in the `Complete` branch of the discriminated union — `JSON.parse` is safe without extra null guards.

```tsx
import { defineToolCallRenderer } from "@copilotkit/react-core/v2"
import { ToolCallStatus } from "@copilotkit/core"
import { z } from "zod"
import StockPriceChart from "./StockPriceChart"

const argsSchema = z.object({ company_name: z.string() })

export const StockDataToolRenderer = defineToolCallRenderer({
  name: "get-stock-data",
  args: argsSchema,
  render: ({ status, result }) => {
    if (status === ToolCallStatus.Complete) {
      const parsed = JSON.parse(result) as { company, ticker, currency, data, error? }
      if (parsed.error) return <p className="text-red-400 text-sm">{parsed.error}</p>
      return <StockPriceChart company={parsed.company} ticker={parsed.ticker} data={parsed.data} />
    }
    return <p className="text-gray-400 text-sm animate-pulse">Loading chart…</p>
  },
})
```

No `"use client"` directive needed — this module is only imported from `Providers.tsx` (already a client boundary), so it inherits the client context.

#### `components/Providers.tsx` (modified)

Add the import and `renderToolCalls` prop:

```typescript
import { StockDataToolRenderer } from "./StockDataToolRenderer"

// Inside the JSX:
<CopilotKit
  runtimeUrl="/api/copilotkit"
  agent="agent"
  renderToolCalls={[StockDataToolRenderer]}
>
  {children}
</CopilotKit>
```

---

### Implementation Notes

- **Import path for `ToolCallStatus`** — confirmed as `@copilotkit/core` (a transitive dep, present in `node_modules`). Not re-exported from `@copilotkit/react-core`.
- **Highcharts SSR** — the `mounted` guard is the minimal approach. An alternative is `dynamic(() => import('./StockPriceChart'), { ssr: false })` at the `StockDataToolRenderer.tsx` call site, which also works.
- **`result` is always a string** — even if the tool returns structured JSON, CopilotKit passes it as a serialised string. Always `JSON.parse(result)`.
- **Error result** — if the MCP tool returns `{ "error": "..." }` (unrecognised company), handle it: if `parsed.error` exists, render an error message rather than a chart.
- **Chart height** — set `chart.height` in the Highcharts options (not via CSS on a wrapper div). This prevents x-axis clipping inside the chat bubble: at the old `h-72` (288px) CSS approach, title + plot area + legend left insufficient room for x-axis labels and they were hidden. `chart.height: 350` gives reliable breathing room. No wrapper div or `containerProps` height needed — `<HighchartsReact>` is returned directly.

---

### Acceptance Criteria (Phase 2)

- [x] `npm install` completes without errors after adding the three packages
- [x] Asking "get stock price for Apple" renders a Highcharts line chart in the chat (not raw JSON)
- [x] Chart title shows "Apple Inc. (AAPL)"
- [x] x-axis shows the 12 months (Jun 2025 – May 2026) as readable dates (was clipped at h-72; fixed by setting `chart.height: 350` — pending re-verification)
- [x] y-axis shows price values with no `$` prefix on labels; currency communicated via "Price (USD)" axis title
- [x] Chart background matches the dark app background (no white box)
- [x] While the tool is executing, a loading indicator is shown
- [x] Asking for an unrecognised company (e.g. "get stock price for Coinbase") renders an error message, not a broken chart
