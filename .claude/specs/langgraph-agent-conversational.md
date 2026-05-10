# LangGraph Agent — Conversational

## Status
Phase 1: Implemented
Phase 2: Implemented
Phase 3: Implemented

## Overview

A conversational LangGraph ReAct agent served via `langgraph dev` (LangGraph CLI), providing HTTP streaming (SSE) endpoints compatible with the CopilotKit/AG-UI protocol. The agent is wired to one MCP tool (`get-stock-data`) whose server code lives in the same folder, launched as a subprocess via stdio transport — no separately hosted service required.

Future CopilotKit/Next.js frontend wiring is a separate plan.

---

## Phase 1: Bootstrap `agent-convo`

### Goals

- Create a minimal, runnable LangGraph ReAct agent in `agent-convo/`
- Wire one MCP tool (`get-stock-data`) using `langchain-mcp-adapters` + an in-folder MCP server (`mcp_server.py`) over stdio transport
- Expose the agent via `langgraph dev`, providing `/runs/stream` SSE endpoints out of the box
- Apply correct env file, `.gitignore`, and `uv`/`pyproject.toml` conventions

---

### File Structure

```
agent-convo/
├── pyproject.toml           # project metadata and dependencies
├── uv.lock                  # committed lockfile
├── .python-version          # pins Python version (3.14) for uv
├── langgraph.json           # LangGraph CLI config — points to graph entrypoint
├── .env.example             # committed placeholder template
├── .env                     # real secrets — gitignored
├── agent.py                 # LangGraph graph definition and entrypoint
├── mcp_server.py            # MCP server (stdio transport) with get-stock-data tool
└── mock_data/
    ├── __init__.py          # marks directory as a Python package (empty, committed)
    └── stock_prices.py      # MONTHS, STOCK_DATA, ALIASES constants
```

---

### Dependencies

**Runtime** (in `[project.dependencies]`):

| Package | Purpose |
|---|---|
| `langgraph>=1.1` | Graph runtime |
| `langchain>=1.2` | `create_agent` (ReAct agent factory, moved here from `langgraph.prebuilt` in LangGraph 1.x) |
| `langchain-openai>=0.3` | `ChatOpenAI` model integration |
| `langchain-mcp-adapters>=0.2` | Bridges MCP tools into LangChain/LangGraph tool format |
| `mcp>=1.27` | Official Python MCP SDK — used to define the MCP server |
| `python-dotenv>=1.2` | Loads `.env` into environment at startup |

**Dev** (in `[dependency-groups] dev` — PEP 735, required by uv 0.4+):

| Package | Purpose |
|---|---|
| `langgraph-cli[inmem]>=0.4` | Provides `langgraph dev` command for local serving |

All dependencies use `>=` lower-bound constraints; `uv sync` resolves the latest compatible versions and writes `uv.lock`. Latest confirmed versions (May 2026): langgraph 1.1.10, langchain 1.2.18, langchain-openai 0.3.14, langchain-mcp-adapters 0.2.2, mcp 1.27.1, python-dotenv 1.2.2, langgraph-cli 0.4.25.

---

### File Descriptions

#### `pyproject.toml`

Flat project (no src layout — keeps it simple for a service). Declares:
- `[project]` metadata: name `agent-convo`, `requires-python = ">=3.14"`
- Runtime dependencies (listed above)
- `[tool.uv] package = false` — no package install, just dependency management; `uv sync` installs into `.venv`
- `[dependency-groups] dev` with `langgraph-cli[inmem]` (PEP 735 format — `tool.uv.dev-dependencies` is deprecated as of uv 0.4)

#### `.python-version`

Single line: `3.14` — used by `uv` to select the Python interpreter automatically.

#### `langgraph.json`

LangGraph CLI config. Points to the graph entrypoint and the env file:

```json
{
  "dependencies": ["."],
  "graphs": {
    "agent": "./agent.py:graph"
  },
  "env": ".env"
}
```

The `"dependencies": ["."]` tells the CLI to install the current directory's dependencies before serving.

#### `.env.example`

Committed to the repo. Contains placeholder values — safe to expose:

```dotenv
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_MODEL=gpt-4o-mini
```

#### `.env`

Not committed (see `.gitignore` section). Developer copies `.env.example` → `.env` and fills in real values.

#### `mock_data/stock_prices.py`

Contains the three data constants imported by `mcp_server.py`:

- `MONTHS` — list of 12 `YYYY-MM` strings spanning Jun 2025 – May 2026
- `STOCK_DATA` — dict keyed by lowercase company name with `ticker`, `company`, and `prices` fields for each of the Magnificent 7
- `ALIASES` — dict mapping ticker symbols and alternate names (e.g. `"aapl"`, `"alphabet"`, `"fb"`) to canonical `STOCK_DATA` keys

| Company | Aliases accepted | Price range (fictional) |
|---|---|---|
| Apple | `apple`, `aapl` | $195 – $219 |
| Microsoft | `microsoft`, `msft` | $415 – $457 |
| Google / Alphabet | `google`, `alphabet`, `googl` | $175 – $196 |
| Amazon | `amazon`, `amzn` | $190 – $216 |
| Meta | `meta`, `facebook`, `fb` | $545 – $592 |
| Tesla | `tesla`, `tsla` | $238 – $276 |
| Nvidia | `nvidia`, `nvda` | $875 – $1145 |

#### `mock_data/__init__.py`

Empty file. Marks `mock_data/` as an importable Python package, enabling `from mock_data.stock_prices import ...` in `mcp_server.py`. Committed to the repo.

#### `mcp_server.py`

Defines the MCP server using the `mcp` SDK with stdio transport. Contains a file-level comment noting that for simplicity the MCP server is co-located in this project (proof-of-concept); for a real-world platform it would be a separate project on its own endpoint.

1. **`get-stock-data` tool** — registered MCP tool that:
   - Takes one argument: `company_name: str`
   - Resolves the company name via `_resolve_company` (exact STOCK_DATA → exact ALIASES → fuzzy match — see Phase 3)
   - Returns a JSON string (see Phase 2 for shape) on success
   - Returns `{ "error": "..." }` JSON if no match is found

2. **Server entry point** — starts the MCP server on `stdio` transport when run as `__main__`

#### `agent.py`

Defines the LangGraph ReAct agent. Contains:

1. **Env loading** — `load_dotenv()` at module top
2. **MCP client setup** — uses `MultiServerMCPClient` from `langchain-mcp-adapters` configured to launch `mcp_server.py` via stdio transport. A comment above the client configuration notes that for simplicity the MCP server is co-located (proof-of-concept); for a real-world platform it would be a separate project on its own endpoint connected over HTTP:
   ```
   command: sys.executable   (ensures the venv Python is used for the subprocess)
   args: [absolute path to mcp_server.py]
   transport: "stdio"
   ```
3. **Graph factory** — an async function `graph()` that:
   - On first call, instantiates `MultiServerMCPClient` and calls `await client.get_tools()` (session lifecycle managed internally by the client — context manager usage removed in `langchain-mcp-adapters` 0.1.0+)
   - Instantiates `ChatOpenAI` with model from `OPENAI_MODEL` env var
   - Returns `create_agent(model, tools)` from `langchain.agents` — a compiled `Pregel` graph
   - Caches the compiled graph in a module-level `_compiled` variable; subsequent calls return it immediately
4. **Module-level `graph` export** — the async factory function exported as `graph`, referenced by `langgraph.json`; `langgraph dev` awaits it on each request and the cache ensures the MCP client is only initialised once

---

### `.gitignore`

A single root `.gitignore` covers the entire monorepo — no per-project gitignore files. Structure:

```gitignore
# ── Repo-wide ──────────────────────────────────────────────────────────────
.DS_Store
*.pem
*.bak
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# ── frontend/ (Next.js) ────────────────────────────────────────────────────
frontend/node_modules/
frontend/.pnp
frontend/.pnp.*
frontend/.next/
frontend/out/
frontend/build/
frontend/coverage/
frontend/.vercel/
frontend/.env*
!frontend/.env.local.example
frontend/next-env.d.ts
frontend/*.tsbuildinfo

# ── agent-convo/ (Python / LangGraph) ─────────────────────────────────────
agent-convo/.env
agent-convo/.venv/
agent-convo/**/__pycache__/
agent-convo/**/*.pyc
agent-convo/**/*.pyo
agent-convo/.ruff_cache/
agent-convo/.langgraph_api/
```

Notable decisions:
- `agent-convo/.env` is ignored; `agent-convo/.env.example` is committed
- `agent-convo/.langgraph_api/` — created by `langgraph dev` as a local persistence store (Python pickle files holding dev-session checkpoints and thread state); ephemeral, binary, never committed
- `frontend/.env*` broadly ignores all env files in the frontend; `!frontend/.env.local.example` negation allows the committed template through
- `uv.lock` and `.python-version` are committed (not ignored)

---

### Repo Governance Files

Created alongside Phase 1 as repo-wide infrastructure:

**`AGENTS.md`** (root) — rules for all AI coding agents. Contains:
- A universal security rule: never embed real API keys or secrets in code, config, or documentation files
- Python-specific: secrets in `.env` (gitignored), template in `.env.example` (committed)
- Next.js-specific: secrets in `.env.local` (gitignored by default); `.env` for non-secret defaults only
- `.gitignore` rule: always verify secret-containing files are excluded — specifically `.env` for Python and `.env.local`, `.env.development.local`, `.env.test.local`, `.env.production.local` for Next.js

**`CLAUDE.md`** (root) — contains `@AGENTS.md` to import the rules into Claude Code. Mirrors the pattern already used in `frontend/CLAUDE.md` → `frontend/AGENTS.md`.

---

### Install & Run

After implementation, these are the commands to set up and run the agent:

```bash
# 1. Navigate to the agent folder
cd agent-convo

# 2. Copy the example env file and fill in your real values
cp .env.example .env
# Edit .env: set OPENAI_API_KEY and OPENAI_MODEL

# 3. Install dependencies (creates .venv automatically)
uv sync

# 4. Start the LangGraph dev server (hot-reload enabled)
uv run langgraph dev
```

The dev server starts on `http://localhost:2024` by default and exposes:
- `POST /runs/stream` — streaming SSE endpoint (used by CopilotKit/AG-UI)
- `GET /docs` — auto-generated API docs

To test the `get-stock-data` tool directly (optional smoke test):

```bash
uv run python mcp_server.py
# Then send a JSON-RPC message via stdin, or use mcp inspect if available
```

---

### OpenAI Model Selection

Confirmed pricing and capabilities as of May 2026:

| Model ID | Input $/MTok | Output $/MTok | Notes |
|---|---|---|---|
| `gpt-5.5` | $5.00 | $30.00 | Strongest all-round |
| `gpt-5.4` | $2.50 | $15.00 | Strong agentic/tool use, computer use API |
| `gpt-5.4-mini` | $0.75 | $4.50 | Cost-efficient 5.4 |
| `gpt-5.4-nano` | $0.20 | $1.25 | Lightweight, fast |
| `gpt-4o` | $2.50 | $10.00 | Solid multimodal tool use |
| **`gpt-4o-mini`** | **$0.15** | **$0.60** | **Selected — fast, cheap, reliable tool use** |
| `o3` | $2.00 | $8.00 | Complex reasoning, math, coding |
| `o4-mini` | $1.10 | $4.40 | Fast reasoning, strong for agentic tasks |

**Chosen model: `gpt-4o-mini`** — appropriate for both current use cases:
- *(a) Simple prompts + MCP tool calls:* Fast and cheap; no reasoning overhead needed when the task is "call tool, return data".
- *(b) Simple autonomous agent demos with small graphs:* More than capable for concept demonstration. Upgrade path: `o4-mini` if multi-step reasoning proves insufficient, at ~7x cost.

Model is configured via `OPENAI_MODEL` in `.env` — changing it requires no code changes.

---

### Implementation Issues Resolved

Issues encountered during Phase 1 bring-up and their resolutions:

**1. `tool.uv.dev-dependencies` deprecation warning**
- uv 0.4+ deprecated `[tool.uv] dev-dependencies` in favour of PEP 735 `[dependency-groups]`
- Fix: moved dev deps to `[dependency-groups] dev = [...]` in `pyproject.toml`

**2. `MultiServerMCPClient` context manager removed (`langchain-mcp-adapters` 0.1.0+)**
- The original `agent.py` used `await client.__aenter__()` to start the MCP session
- As of `langchain-mcp-adapters` 0.1.0, context manager usage raises `NotImplementedError`
- Fix: replaced with `tools = await client.get_tools()` — session lifecycle is now managed internally by the client

**3. `create_react_agent` deprecated in LangGraph 1.x**
- `from langgraph.prebuilt import create_react_agent` is decorated `@deprecated` in LangGraph 1.x with `LangGraphDeprecatedSinceV10`
- Moved to `langchain.agents`; replacement is `from langchain.agents import create_agent`
- Fix: updated import in `agent.py`; added `langchain>=1.2` as an explicit dependency in `pyproject.toml`

**4. LangSmith API key banner in Studio UI**
- `langgraph dev` opens LangGraph Studio in the browser and displays a warning if `LANGSMITH_API_KEY` is absent
- LangSmith is an optional tracing/observability service — the agent functions correctly without it
- No action required; add `LANGSMITH_API_KEY` to `.env` only if tracing is desired

---

### Acceptance Criteria (Phase 1)

- [x] `uv sync` completes without errors
- [x] `uv run langgraph dev` starts without errors and the `/docs` endpoint is reachable
- [x] A prompt like `"get stock price for apple"` returns the 12 monthly data points for Apple
- [x] Company name matching is case-insensitive (`Apple`, `apple`, `AAPL`, `aapl` all resolve)
- [x] `.env` is not tracked by git; `.env.example` is
- [x] `uv.lock` and `.python-version` are tracked by git

---

## Phase 2: Structured JSON tool output

### Goals

- Change `get-stock-data` to return a JSON string instead of formatted plain text
- Design the JSON shape around Highcharts requirements, so a future frontend chart renderer can consume it directly with minimal transformation
- Include a minimal `summary` field for the LLM — deliberately omitting data frequency and actual prices so it cannot drift out of sync with the structured data
- Extract mock data into a dedicated `mock_data/` package to separate data from logic
- Keep the LLM working correctly — LLMs handle JSON tool results well and will summarise naturally from the `summary` field

Files changed:
- `mock_data/__init__.py` — new empty file; marks `mock_data/` as an importable Python package
- `mock_data/stock_prices.py` — new file; contains `MONTHS`, `STOCK_DATA`, and `ALIASES` extracted from `mcp_server.py`
- `mcp_server.py` — imports from `mock_data.stock_prices`; data definitions removed; return value changed to JSON

`agent.py` and all other files are unaffected.

---

### JSON Output Shape

```json
{
  "company": "Apple Inc.",
  "ticker": "AAPL",
  "currency": "USD",
  "summary": "Apple Inc. (AAPL)\nClosing prices (Jun 2025 – May 2026)",
  "data": [
    { "month": "2025-06", "price": 195.42 },
    { "month": "2025-07", "price": 198.17 },
    ...
  ]
}
```

Field rationale:

| Field | Purpose |
|---|---|
| `company` | Full company name — used as chart title / series name |
| `ticker` | Ticker symbol — displayed alongside company name in chart header |
| `currency` | Currency code — used to prefix the Highcharts Y-axis label (`$` for `USD`) without hardcoding it in the frontend component |
| `summary` | Minimal human-readable label for the LLM: `<company> (<ticker>)\nClosing prices (<period>)`. Deliberately omits data frequency and actual prices to avoid drifting out of sync with the `data` array if the structure changes. The date range is derived dynamically from `MONTHS[0]` and `MONTHS[-1]`, so it stays correct if the period is extended. |
| `data[].month` | `YYYY-MM` string — human-readable for the LLM; converted to `Date.UTC(year, month-1, 1)` on the frontend for a Highcharts `xAxis.type: "datetime"` series |
| `data[].price` | Monthly closing price as a float |

The `data` array maps directly to a Highcharts series after a one-line transform on the frontend:

```js
data.map(({ month, price }) => {
  const [y, m] = month.split("-").map(Number);
  return [Date.UTC(y, m - 1, 1), price];
})
```

---

### Error Case

The not-found error is also returned as JSON for consistency, so the frontend can handle both success and error responses with a single type check:

```json
{ "error": "Company 'Foo' not found. Valid options: amazon, apple, google, meta, microsoft, nvidia, tesla" }
```

The LLM receives this JSON string and will relay the error naturally in its response.

---

### `mcp_server.py` Changes

- Add `import json` and `from datetime import datetime`
- Import `ALIASES`, `MONTHS`, `STOCK_DATA` from `mock_data.stock_prices`; remove inline data definitions
- Replace the formatted f-string return with `json.dumps(...)` of the structured dict including `summary`
- Replace the plain-text error return with `json.dumps({"error": ...})`
- `summary` value is built dynamically from `MONTHS[0]` and `MONTHS[-1]` via `datetime.strptime` — stays correct if the period is extended
- Tool signature and docstring unchanged

---

### Acceptance Criteria (Phase 2)

- [x] `get-stock-data` returns a valid JSON string for all seven companies and all aliases
- [x] Returned JSON contains `company`, `ticker`, `currency`, `summary`, and `data` fields
- [x] `data` contains exactly 12 objects, each with `month` (`YYYY-MM`) and `price` (float)
- [x] `summary` is of the form `<Company> (<TICKER>)\nClosing prices (<Mon YYYY> – <Mon YYYY>)`
- [ ] Not-found errors return `{ "error": "..." }` JSON
- [x] LLM still produces a coherent natural-language response when asked about stock prices (no regression from the format change)

---

## Phase 3: Fuzzy company name matching

### Goals

- Replace the current hard-fail exact lookup with a fuzzy-match fallback so that slight misspellings, punctuation variations (`.`, `-`), and partial names still resolve to the correct company
- Preserve existing exact-match behaviour as a fast path — no behaviour change for current inputs
- Keep aliases (tickers, alternate names) fully functional alongside fuzzy matching
- No new dependencies — `difflib` is Python stdlib

Only `mcp_server.py` changes. `mock_data/stock_prices.py` and all other files are unaffected.

---

### Algorithm

Resolution runs in three stages, returning at the first match:

1. **Exact STOCK_DATA lookup** — `key in STOCK_DATA` — handles canonical names (`"apple"`, `"nvidia"`)
2. **Exact ALIASES lookup** — `key in ALIASES` — handles tickers (`"aapl"`, `"nvda"`) and alternate names (`"alphabet"`, `"facebook"`)
3. **Fuzzy match** — `difflib.get_close_matches` against the full candidate pool (see below) — handles misspellings, punctuation, partial names

If all three fail, the error JSON is returned.

---

### Candidate Pool

The fuzzy match pool is a module-level dict `_CANDIDATES` mapping every matchable string → STOCK_DATA canonical key. Built once at import time from `STOCK_DATA` and `ALIASES`:

| Source | Examples | Count |
|---|---|---|
| STOCK_DATA canonical keys | `"apple"`, `"nvidia"` | 7 |
| ALIASES keys | `"aapl"`, `"facebook"`, `"alphabet"` | 10 |
| Lowercased full company names | `"apple inc."`, `"nvidia corporation"` | 7 |

Total: ~24 candidates. Small enough that fuzzy matching over the full pool is negligible cost.

Full company names are lowercased when added to `_CANDIDATES` so they are compared consistently against the already-lowercased input.

Example `_CANDIDATES` entries:

```python
{
    "apple":                "apple",    # STOCK_DATA key
    "aapl":                 "apple",    # ALIASES key
    "apple inc.":           "apple",    # lowercased company name
    "nvidia":               "nvidia",   # STOCK_DATA key
    "nvda":                 "nvidia",   # ALIASES key
    "nvidia corporation":   "nvidia",   # lowercased company name
    "alphabet":             "google",   # ALIASES key
    "alphabet inc.":        "google",   # lowercased company name
    ...
}
```

---

### New Constants and Functions in `mcp_server.py`

**`FUZZY_CUTOFF = 0.6`** — named constant at module level. The `difflib.get_close_matches` similarity threshold (0–1). Set to `0.6` (the `difflib` default) to make the tuning point explicit.

**`_CANDIDATES`** — module-level dict built at import time:

```python
_CANDIDATES = {}
for _k in STOCK_DATA:
    _CANDIDATES[_k] = _k
for _alias, _canonical in ALIASES.items():
    _CANDIDATES[_alias] = _canonical
for _k, _v in STOCK_DATA.items():
    _CANDIDATES[_v["company"].lower()] = _k
```

**`_resolve_company(name: str) -> str | None`** — returns the STOCK_DATA canonical key for any input, or `None` if no match found at or above `FUZZY_CUTOFF`:

```python
def _resolve_company(name: str) -> str | None:
    key = name.lower().strip()
    if key in STOCK_DATA:
        return key
    if key in ALIASES:
        return ALIASES[key]
    matches = difflib.get_close_matches(key, _CANDIDATES, n=1, cutoff=FUZZY_CUTOFF)
    if matches:
        return _CANDIDATES[matches[0]]
    return None
```

**`get_stock_data`** — replaces the inline lookup with a call to `_resolve_company`:

```python
canonical = _resolve_company(company_name)
if canonical is None:
    ...  # return error JSON as before
entry = STOCK_DATA[canonical]
...  # return success JSON as before
```

---

### Example Inputs That Now Succeed

| Input | Matched via | Resolves to |
|---|---|---|
| `"Apple"` | exact STOCK_DATA | `"apple"` |
| `"AAPL"` | exact ALIASES | `"apple"` |
| `"Aple"` | fuzzy → `"apple"` (~0.89) | `"apple"` |
| `"Amazon.com"` | fuzzy → `"amazon.com inc."` (~0.87) | `"amazon"` |
| `"Amazon.com Inc"` | fuzzy → `"amazon.com inc."` (~0.97) | `"amazon"` |
| `"Nvidia Corp"` | fuzzy → `"nvidia corporation"` (~0.76) | `"nvidia"` |
| `"Microsoft Corp"` | fuzzy → `"microsoft corporation"` (~0.78) | `"microsoft"` |
| `"Meta Platforms Inc"` | fuzzy → `"meta platforms inc."` (~0.97) | `"meta"` |
| `"Tesla Inc"` | fuzzy → `"tesla inc."` (~0.95) | `"tesla"` |
| `"Alphabet Inc"` | fuzzy → `"alphabet inc."` (~0.96) | `"google"` |
| `"Alphabt"` | fuzzy → `"alphabet"` (~0.80) | `"google"` |

---

### Acceptance Criteria (Phase 3)

- [x] All existing exact matches continue to work unchanged
- [x] Ticker symbols (`AAPL`, `NVDA`, `MSFT`, etc.) continue to resolve via the fast-path alias lookup
- [x] Slight misspellings resolve correctly (e.g. `"Aple"` → Apple, `"Tesle"` → Tesla)
- [x] Punctuation variants resolve correctly (e.g. `"Amazon.com"`, `"Nvidia-Corp"`)
- [x] Partial company names resolve correctly (e.g. `"Nvidia Corp"`, `"Meta Platforms"`)
- [x] Unrecognisable input still returns the `{ "error": "..." }` JSON
- [x] `FUZZY_CUTOFF = 0.6` is defined as a named constant
