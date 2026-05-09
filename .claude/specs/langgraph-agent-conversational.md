# LangGraph Agent — Conversational

## Status
Phase 1: Implemented

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
├── pyproject.toml       # project metadata and dependencies
├── uv.lock              # committed lockfile
├── .python-version      # pins Python version (3.14) for uv
├── langgraph.json       # LangGraph CLI config — points to graph entrypoint
├── .env.example         # committed placeholder template
├── .env                 # real secrets — gitignored
├── agent.py             # LangGraph graph definition and entrypoint
└── mcp_server.py        # MCP server (stdio transport) with get-stock-data tool
```

---

### Dependencies

**Runtime** (in `[project.dependencies]`):

| Package | Purpose |
|---|---|
| `langgraph>=1.1` | Graph runtime and `create_react_agent` |
| `langchain-openai>=0.3` | `ChatOpenAI` model integration |
| `langchain-mcp-adapters>=0.2` | Bridges MCP tools into LangChain/LangGraph tool format |
| `mcp>=1.27` | Official Python MCP SDK — used to define the MCP server |
| `python-dotenv>=1.2` | Loads `.env` into environment at startup |

**Dev** (in `[dependency-groups] dev` — PEP 735, required by uv 0.4+):

| Package | Purpose |
|---|---|
| `langgraph-cli[inmem]>=0.4` | Provides `langgraph dev` command for local serving |

All dependencies use `>=` lower-bound constraints; `uv sync` resolves the latest compatible versions and writes `uv.lock`. Latest confirmed versions (May 2026): langgraph 1.1.10, langchain-openai 0.3.14, langchain-mcp-adapters 0.2.2, mcp 1.27.1, python-dotenv 1.2.2, langgraph-cli 0.4.25.

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

#### `mcp_server.py`

Defines the MCP server using the `mcp` SDK with stdio transport. Contains:

1. **Mock data store** — a dict keyed by lowercase company name (and common aliases), with 12 monthly price data points spanning June 2025 – May 2026:

   | Company | Aliases accepted | Price range (fictional) |
   |---|---|---|
   | Apple | `apple`, `aapl` | $195 – $219 |
   | Microsoft | `microsoft`, `msft` | $415 – $457 |
   | Google / Alphabet | `google`, `alphabet`, `googl` | $175 – $196 |
   | Amazon | `amazon`, `amzn` | $190 – $216 |
   | Meta | `meta`, `facebook`, `fb` | $545 – $592 |
   | Tesla | `tesla`, `tsla` | $238 – $276 |
   | Nvidia | `nvidia`, `nvda` | $875 – $1145 |

   **Full mock data (12 monthly points, Jun 2025 – May 2026):**

   ```
   Apple:     195.42, 198.17, 201.53, 197.88, 204.21, 209.67,
              213.44, 208.92, 211.35, 215.78, 212.44, 218.93

   Microsoft: 415.20, 421.85, 418.37, 425.62, 431.44, 438.71,
              445.23, 440.88, 448.15, 452.37, 449.92, 457.11

   Google:    175.34, 178.92, 176.45, 181.23, 184.67, 188.91,
              191.45, 187.23, 190.56, 193.78, 191.22, 196.44

   Amazon:    190.45, 194.23, 197.88, 193.44, 199.67, 205.23,
              210.88, 206.34, 209.77, 213.45, 210.88, 216.33

   Meta:      545.33, 552.18, 558.77, 549.22, 562.88, 571.45,
              579.33, 567.88, 575.22, 583.44, 578.92, 592.11

   Tesla:     245.67, 238.44, 251.23, 243.88, 258.44, 265.23,
              271.88, 255.44, 262.77, 275.33, 259.88, 268.44

   Nvidia:    875.44, 912.33, 948.77, 921.44, 977.88, 1023.45,
              1067.22, 1034.88, 1078.33, 1112.44, 1089.77, 1145.22
   ```

2. **`get-stock-data` tool** — registered MCP tool that:
   - Takes one argument: `company_name: str`
   - Normalises input to lowercase, strips whitespace
   - Looks up against the alias map (case-insensitive)
   - Returns a structured response: company name, ticker, and the 12 monthly data points as a list of `{ "month": "YYYY-MM", "price": float }` objects
   - Returns a clear error string if the company is not found, listing valid options

3. **Server entry point** — starts the MCP server on `stdio` transport when run as `__main__`

#### `agent.py`

Defines the LangGraph ReAct agent. Contains:

1. **Env loading** — `load_dotenv()` at module top
2. **MCP client setup** — uses `MultiServerMCPClient` from `langchain-mcp-adapters` configured to launch `mcp_server.py` via stdio transport:
   ```
   command: sys.executable   (ensures the venv Python is used for the subprocess)
   args: [absolute path to mcp_server.py]
   transport: "stdio"
   ```
3. **Graph factory** — an async function `graph()` that:
   - On first call, instantiates `MultiServerMCPClient` and calls `await client.get_tools()` (session lifecycle managed internally by the client — context manager usage removed in `langchain-mcp-adapters` 0.1.0+)
   - Instantiates `ChatOpenAI` with model from `OPENAI_MODEL` env var
   - Returns `create_react_agent(model, tools)` — a compiled `Pregel` graph
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
frontend/next-env.d.ts
frontend/*.tsbuildinfo

# ── agent-convo/ (Python / LangGraph) ─────────────────────────────────────
agent-convo/.env
agent-convo/.venv/
agent-convo/__pycache__/
agent-convo/*.pyc
agent-convo/*.pyo
agent-convo/.ruff_cache/
agent-convo/.langgraph_api/
```

Notable decisions:
- `agent-convo/.env` is ignored; `agent-convo/.env.example` is committed
- `agent-convo/.langgraph_api/` — created by `langgraph dev` as a local persistence store (Python pickle files holding dev-session checkpoints and thread state); ephemeral, binary, never committed
- `frontend/.env*` broadly ignores all env files in the frontend (Next.js convention); no `.env.example` exists there
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

**3. LangSmith API key banner in Studio UI**
- `langgraph dev` opens LangGraph Studio in the browser and displays a warning if `LANGSMITH_API_KEY` is absent
- LangSmith is an optional tracing/observability service — the agent functions correctly without it
- No action required; add `LANGSMITH_API_KEY` to `.env` only if tracing is desired

---

### Acceptance Criteria (Phase 1)

- [ ] `uv sync` completes without errors
- [ ] `uv run langgraph dev` starts without errors and the `/docs` endpoint is reachable
- [ ] A prompt like `"get stock price for apple"` returns the 12 monthly data points for Apple
- [ ] Company name matching is case-insensitive (`Apple`, `apple`, `AAPL`, `aapl` all resolve)
- [ ] `.env` is not tracked by git; `.env.example` is
- [ ] `uv.lock` and `.python-version` are tracked by git
