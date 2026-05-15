# LangGraph Agent — Autonomous

## Status
Implemented

---

## Overview

An autonomous-workflow LangGraph agent served via `langgraph dev` on port **2025**, sibling to `agent-convo/`. Demonstrates a linear pipeline with a random branch decision. Each node makes a lightweight ("no-op") LLM call to demonstrate the pattern of an agent that could readily be adapted for real-world reasoning over tool outputs or external data.

The graph is designed so that the full workflow state (progress, completed steps, branch taken, per-step timestamps) is visible via LangGraph's built-in state API at any point during execution, laying the groundwork for a future visualization frontend.

---

## File Structure

```
agent-auto/
├── pyproject.toml        # dependencies and project metadata
├── uv.lock               # committed lockfile
├── .python-version       # pins Python version for uv (3.14)
├── langgraph.json        # LangGraph CLI config — graph entrypoint
├── .env.example          # committed placeholder template
├── .env                  # real secrets — gitignored
└── agent.py              # graph definition, state, nodes, entrypoint
```

No `mcp_server.py` and no `mock_data/` folder — this agent has no tools in the initial implementation.

---

## Graph Design

### State

```python
def _append_list(a: list | None, b: list) -> list:
    return (a or []) + b

def _merge_dicts(a: dict | None, b: dict) -> dict:
    return {**(a or {}), **b}

class WorkflowState(MessagesState):
    status: str
    completed_steps: Annotated[list[str], _append_list]
    decision: Optional[str]
    step_timings: Annotated[dict, _merge_dicts]
```

Notes on state design:
- Extends `MessagesState` (not `TypedDict` directly). `MessagesState` provides `messages: Annotated[list[AnyMessage], add_messages]` — this is required for LangGraph Studio to enable the Chat view and for CopilotKit AG-UI compatibility.
- `completed_steps` uses a None-safe `_append_list` reducer — handles the initial invocation where the field hasn't been set yet.
- `step_timings` uses a None-safe `_merge_dicts` reducer for the same reason. Each node writes its two keys (`{step}_started_at`, `{step}_completed_at`) without clobbering other nodes' entries. Timestamps are ISO 8601 strings (`datetime.now(timezone.utc).isoformat()`).

### Timing note for future polling frontends
LangGraph persists state only when a node **returns** — not mid-execution. This means a polling frontend will see state as of the *last completed node*, not the currently-running one. For example, while step_2 is sleeping, the state will still reflect step_1's completion. A node's `started_at` timestamp will not appear in the state snapshot until that node returns its update. This is a known LangGraph architectural property and is acceptable for this demo — streaming-based frontends see live updates after each node completes. Noted here so it does not surprise during future frontend work.

### Nodes

| Node | LLM prompt (no-op pattern) | Other work |
|---|---|---|
| `router_node` | No LLM call | Checks last message for `WORKFLOW_TRIGGER_MESSAGE` (case-insensitive); handles both empty messages and multimodal content-block format defensively |
| `step_1_node` | "You are executing Step 1 of the AutoWorkflow pipeline. Acknowledge that you are processing this step in one sentence." | Sleep, record timestamps, update completed_steps |
| `step_2_node` | Same pattern, Step 2 | Sleep, timestamps, completed_steps |
| `step_3_node` | Same pattern, Step 3 | Sleep, timestamps, completed_steps |
| `decision_node` | After random decision: "You are the Decision Step of the AutoWorkflow pipeline. The workflow has randomly selected branch {decision}. Acknowledge this decision in one sentence." | `random.choice(["4a", "4b"])`, sleep, timestamps |
| `step_4a_node` | "You are executing Step 4a (branch A) of the AutoWorkflow pipeline. This is the final step. Acknowledge completion in one sentence." | Sleep, timestamps, set status = "complete" |
| `step_4b_node` | "You are executing Step 4b (branch B) of the AutoWorkflow pipeline. This is the final step. Acknowledge completion in one sentence." | Sleep, timestamps, set status = "complete" |

Each LLM call uses `ChatOpenAI` with model from `OPENAI_MODEL` env var. The response content is appended to `messages` as an `AIMessage`.

### Node execution order

**Standard step nodes (Step 1, 2, 3, 4a, 4b):**

1. Record `{step}_started_at` timestamp in-memory
2. Log `[START]` to terminal
3. Call LLM with contextual no-op prompt
4. Log `[LLM]` response content to terminal
5. `await asyncio.sleep(STEP_DELAY_SECONDS)`
6. Record `{step}_completed_at` timestamp in-memory
7. Log `[END]` to terminal
8. Return updated state: `messages` (AIMessage appended), `completed_steps` entry, `step_timings` entries, `status = "complete"` if final step

**Decision node:**

1. Record `decision_started_at` in-memory
2. Log `[START]` to terminal
3. Make random decision: `decision = random.choice(["4a", "4b"])`
4. Call LLM with prompt that includes the chosen branch
5. Log `[LLM]` response content to terminal
6. `await asyncio.sleep(STEP_DELAY_SECONDS)`
7. Record `decision_completed_at` in-memory
8. Log `[END]` to terminal with branch info
9. Return updated state: `messages`, `completed_steps`, `step_timings`, `decision`

> **Note on mid-node start timestamps:** Since LangGraph only persists state on node return, the `started_at` timestamp is recorded in-memory and written to state in the same return dict as `completed_at`. Both timestamps appear in state simultaneously when the node completes. If the future frontend needs to observe a node "starting" in real time via polling, nodes can be split into two sub-nodes (start + end) — intentionally deferred.

### Constants (top of `agent.py`)

```python
SIMULATED_STEP_DELAY_SECONDS = 5
WORKFLOW_TRIGGER_MESSAGE = "start workflow"
```

`SIMULATED_STEP_DELAY_SECONDS` makes clear the delay is artificial. `WORKFLOW_TRIGGER_MESSAGE` is used in both the trigger check and the help message returned to the user, keeping them in sync.

### Edges

```
START
  └─> router_node
        ├─> step_1_node  (if last message contains "start workflow", case-insensitive)
        └─> END          (if unrecognised input or empty messages — returns help message via AIMessage)

step_1_node ──> step_2_node
step_2_node ──> step_3_node
step_3_node ──> decision_node

decision_node (conditional edge)
  ├─> step_4a_node  (if decision == "4a")
  └─> step_4b_node  (if decision == "4b")

step_4a_node ──> END
step_4b_node ──> END
```

**Important:** Both `add_conditional_edges` calls include an explicit path map (list of possible destinations). Without this, LangGraph Studio cannot statically determine all reachable nodes at compile time and renders disconnected islands in the graph visualisation.

```python
builder.add_conditional_edges("router_node", route_from_router, ["step_1_node", END])
builder.add_conditional_edges("decision_node", route_after_decision, ["step_4a_node", "step_4b_node"])
```

---

## Terminal Logging

All logging uses Python's standard `logging` module (not `print`), configured at module level with a simple format. Each node emits three log lines — start, LLM response, and end.

```
[START] Step 1         2026-05-15T14:05:00.123456+00:00
[LLM]   Step 1         "I am processing Step 1 of the AutoWorkflow pipeline."
[END]   Step 1         2026-05-15T14:05:05.234567+00:00
[START] Step 2         2026-05-15T14:05:05.240000+00:00
[LLM]   Step 2         "I am processing Step 2 of the AutoWorkflow pipeline."
[END]   Step 2         2026-05-15T14:05:10.xxx
...
[START] Decision Step  2026-05-15T14:05:15.xxx
[LLM]   Decision Step  "The workflow has randomly selected branch 4a."
[END]   Decision Step  2026-05-15T14:05:20.xxx — branch: 4a
[START] Step 4a        2026-05-15T14:05:20.xxx
[LLM]   Step 4a        "I am completing Step 4a, the final step of the AutoWorkflow pipeline."
[END]   Step 4a        2026-05-15T14:05:25.xxx — workflow complete
```

Logger name: `agent_auto`. Level: `INFO`.

---

## Implementation Notes

### `asyncio.sleep` vs `time.sleep`
Node functions are `async` and use `asyncio.sleep(STEP_DELAY_SECONDS)` — NOT `time.sleep()`. The LangGraph dev server runs an async event loop; a synchronous sleep blocks it entirely.

### Port 2025
`langgraph dev` defaults to port 2024. Port 2025 is specified via CLI flag:
```bash
uv run langgraph dev --port 2025
```

### Graph ID naming
`langgraph.json` uses the graph ID `"auto"`. Each folder is its own isolated LangGraph server instance so there is no technical collision with `agent-convo`'s `"agent"` ID. Using `"auto"` ensures the two are distinct if both agents are ever registered in the same CopilotKit `CopilotRuntime`.

### Future visualization compatibility
State fields `status`, `completed_steps`, `decision`, and `step_timings` are designed to be directly readable by a future polling or SSE-based frontend. LangGraph's built-in endpoints (available free via `langgraph dev`):
- `GET /threads/{thread_id}/state` — returns state snapshot after the last completed node
- `POST /threads/{thread_id}/runs/stream` — streams state delta events as each node completes

---

## LangGraph Studio

The agent is designed to be used via LangGraph Studio's Graph view. LangSmith authentication is required (see Configuration Files below).

**Studio URL** (LangSmith US account):
```
https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2025
```

> `langgraph dev` opens this URL automatically. If using the EU LangSmith region, navigate manually to `https://eu.smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2025` and set `LANGSMITH_ENDPOINT=https://eu.api.smith.langchain.com` in `.env`.

**Triggering the workflow from Graph view:**

In the Graph view input panel, submit:
```json
{"messages": [{"role": "user", "content": "start workflow"}]}
```

The full state wrapper (`messages: [...]`) is required — the Studio appends the submitted JSON to the messages array, so a bare `{"role": "user", "content": "..."}` would result in an empty messages list hitting `router_node`.

**Triggering the workflow from Chat view:**

Send `start workflow` as a plain message. The Chat view is enabled by the use of `MessagesState`.

Note: the Chat view wraps message content as a list of content blocks (`[{"type": "text", "text": "..."}]`) rather than a plain string. `router_node` handles both formats — if `content` is a list it extracts and joins the `text` fields before checking for `WORKFLOW_TRIGGER_MESSAGE`.

---

## Dependencies

**Runtime:**

| Package | Purpose |
|---|---|
| `langgraph>=1.1` | Graph runtime |
| `langchain>=1.2` | LangChain base (required by langchain-openai) |
| `langchain-openai>=0.3` | `ChatOpenAI` for no-op LLM calls |
| `python-dotenv>=1.2` | Loads `.env` at startup |

**Dev:**

| Package | Purpose |
|---|---|
| `langgraph-cli[inmem]>=0.4` | `langgraph dev` command |

---

## Configuration Files

### `langgraph.json`

```json
{
  "dependencies": ["."],
  "graphs": { "auto": "./agent.py:graph" },
  "env": ".env"
}
```

### `.env.example`

```
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_MODEL=gpt-4o-mini
LANGSMITH_API_KEY=your-langsmith-api-key-here
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=https://api.smith.langchain.com  # change to https://eu.api.smith.langchain.com if using EU region
```

### `.python-version`

```
3.14
```

---

## Startup

```bash
cd agent-auto
cp .env.example .env   # add OPENAI_API_KEY and LANGSMITH_API_KEY
uv sync
uv run langgraph dev --port 2025
```

Agent available at: `http://localhost:2025`

---

## Potential Future Enhancements

- **MCP tools in step nodes:** One or more step nodes could be expanded to call an MCP tool (e.g., a data-fetch or analysis tool) and pass the result to the LLM call, replacing the no-op prompt with genuine reasoning. The graph structure and state design already support this — each node's LLM call would simply receive richer context. Adding an `mcp_server.py` and `langchain-mcp-adapters` dependency would mirror the pattern established in `agent-convo`.

- **HITL interrupts on step nodes:** A future plan may add `interrupt()` calls inside one or more nodes to pause execution and await human approval before proceeding (consistent with the agent-convo HITL pattern). The graph structure is compatible with this as-is.

- **Dynamic branch routing:** The random decision in `decision_node` could be replaced with a genuine LLM reasoning step (e.g., ask the LLM to choose a branch based on prior step outputs), making the decision non-deterministic but explainable.

- **Mid-node start-time visibility:** `started_at` timestamps only appear in state when a node returns. If the frontend requires observing a node "starting" in real time via polling, nodes can be split into start/end sub-nodes. This is straightforward but intentionally deferred.

---

## `.gitignore` (already updated)

The top-level `.gitignore` has been updated. No further changes needed.

**Global rule (repo-wide section):**
```
.env*
!.env.example
!.env.local.example
```
Catches any `.env*` file anywhere in the repo. Negations preserve committed example templates.

**`agent-auto/` section:**
```
agent-auto/.env
agent-auto/.venv/
agent-auto/**/__pycache__/
agent-auto/**/*.pyc
agent-auto/**/*.pyo
agent-auto/.ruff_cache/
agent-auto/.langgraph_api/
```

---

## What This Plan Does NOT Include

- Frontend wiring — this is a separate future plan
- HITL interrupts — not needed for this autonomous workflow
- MCP tools — not needed in this phase
- Any changes to the existing `agent-convo/` or `frontend/` folders
