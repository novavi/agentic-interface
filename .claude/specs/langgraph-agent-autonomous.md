# LangGraph Agent — Autonomous

## Status
- Phase 1: Implemented ✅
- Phase 2: Implemented ✅

---

## Overview

An autonomous-workflow LangGraph agent served via `langgraph dev` on port **2025**, sibling to `agent-convo/`. Hosts multiple example graphs demonstrating pipeline patterns. Each graph makes lightweight ("no-op") LLM calls per node and uses simulated delays, laying the groundwork for future phases with real data, real tool calls, and HITL interrupts.

The agent is designed so that full workflow state (progress, completed steps, branch taken, per-step timestamps) is visible via LangGraph's built-in state API at any point during execution.

---

## Trigger message design note

All graphs use the same trigger message: `"start workflow"`. This is intentional. In the current architecture the frontend selects which graph to run via `agentId` — the trigger is just a guard inside the already-selected graph. Distinct per-graph trigger messages would only become meaningful if a future meta-dispatcher graph were introduced (one `agentId` routing to sub-graphs based on message content). Domain-specific triggers (e.g. `"start trade matching"`) are reserved for that future phase.

---

## Phase 1 — Example Graph 1 (`agent_auto_example_1`)

### File Structure (Phase 1 — before refactor)

```
agent-auto/
├── pyproject.toml
├── uv.lock
├── .python-version
├── langgraph.json
├── .env.example
├── .env                  # gitignored
└── agent.py              # all graph code (to be refactored in Phase 2)
```

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
- Extends `MessagesState` (not `TypedDict` directly). `MessagesState` provides `messages: Annotated[list[AnyMessage], add_messages]` — required for LangGraph Studio Chat view and CopilotKit AG-UI compatibility.
- `completed_steps` uses a None-safe `_append_list` reducer.
- `step_timings` uses a None-safe `_merge_dicts` reducer. Each node writes its two keys (`{step}_started_at`, `{step}_completed_at`) without clobbering other nodes' entries. Timestamps are ISO 8601 strings.

### Future visualization compatibility

`completed_steps` and `step_timings` are deliberately structured to support a future step-tracker UI (currently rendered as a raw JSON dump). A future frontend component can iterate `completed_steps` for the ordered list of completed node names and look up `{step}_started_at` / `{step}_completed_at` in `step_timings` to compute elapsed time per step. No state schema changes are needed to enable this — it is purely a frontend rendering change.

### Timing note for future polling frontends
LangGraph persists state only when a node **returns** — not mid-execution. A polling frontend sees state as of the last completed node. A node's `started_at` timestamp will not appear until that node returns. Streaming-based frontends (like the current CopilotKit frontend) see live updates after each node completes.

**Note on mid-node start timestamps:** The `{step}_started_at` timestamp is recorded at the beginning of node execution, but because LangGraph only persists state on node return, this timestamp is not visible to external consumers until the node completes. A consumer watching state will see `started_at` and `completed_at` for a given step appear simultaneously when the node returns — not sequentially. If a frontend needs to observe a node "starting" in real time, nodes would need to be split into start/end sub-nodes (see Potential Future Enhancements).

### Nodes

| Node | LLM prompt | Other work |
|---|---|---|
| `router_node` | No LLM call | Checks last message for `WORKFLOW_TRIGGER_MESSAGE` (case-insensitive); handles empty messages and content-block format |
| `step_1_node` | "You are executing Step 1 of the AutoWorkflow pipeline. Acknowledge that you are processing this step in one sentence." | Sleep, timestamps, completed_steps |
| `step_2_node` | Same pattern, Step 2 | Sleep, timestamps, completed_steps |
| `step_3_node` | Same pattern, Step 3 | Sleep, timestamps, completed_steps |
| `decision_node` | After random decision: "You are the Decision Step of the AutoWorkflow pipeline. The workflow has randomly selected branch {decision}. Acknowledge this decision in one sentence." | `random.choice(["4a", "4b"])`, sleep, timestamps |
| `step_4a_node` | "You are executing Step 4a (branch A) of the AutoWorkflow pipeline. This is the final step. Acknowledge completion in one sentence." | Sleep, timestamps, status = "complete" |
| `step_4b_node` | "You are executing Step 4b (branch B) of the AutoWorkflow pipeline. This is the final step. Acknowledge completion in one sentence." | Sleep, timestamps, status = "complete" |

### Constants

```python
SIMULATED_STEP_DELAY_SECONDS = 2.0
WORKFLOW_TRIGGER_MESSAGE = "start workflow"
```

### Node execution order

**Standard step nodes (Step 1, 2, 3, 4a, 4b):**
1. Record `{step}_started_at` timestamp in-memory
2. Log `[START]` to terminal
3. Call LLM with contextual no-op prompt
4. Log `[LLM]` response content to terminal
5. `await asyncio.sleep(SIMULATED_STEP_DELAY_SECONDS)`
6. Record `{step}_completed_at` timestamp in-memory
7. Log `[END]` to terminal
8. Return updated state: `messages`, `completed_steps`, `step_timings`, `status = "complete"` if final step

**Decision node:**
1. Record `decision_started_at` in-memory
2. Log `[START]` to terminal
3. `decision = random.choice(["4a", "4b"])`
4. Call LLM with prompt including chosen branch
5. Log `[LLM]` to terminal
6. `await asyncio.sleep(SIMULATED_STEP_DELAY_SECONDS)`
7. Record `decision_completed_at` in-memory
8. Log `[END]` with branch info
9. Return: `messages`, `completed_steps`, `step_timings`, `decision`

### Edges

```
START → router_node
  ├─> step_1_node  (status == "running")
  └─> END          (unrecognised input — returns help AIMessage)

step_1_node ──> step_2_node ──> step_3_node ──> decision_node
  ├─> step_4a_node  (decision == "4a")
  └─> step_4b_node  (decision == "4b")

step_4a_node ──> END
step_4b_node ──> END
```

Both `add_conditional_edges` calls include explicit path maps so LangGraph Studio can statically render the full graph.

### Terminal Logging

```
[START] Step 1         2026-05-15T14:05:00.123456+00:00
[LLM]   Step 1         "I am processing Step 1 of the AutoWorkflow pipeline."
[END]   Step 1         2026-05-15T14:05:02.634567+00:00
...
[END]   Decision Step  2026-05-15T14:05:10.xxx — branch: 4a
...
[END]   Step 4a        2026-05-15T14:05:15.xxx
```

Logger name: `agent_auto`. Level: `INFO`.

### Implementation Notes

- Node functions are `async`; use `asyncio.sleep` not `time.sleep`.
- Each LLM call uses `ChatOpenAI` with model from `OPENAI_MODEL` env var. The response content is appended to `messages` as an `AIMessage`.
- Port 2025: `uv run langgraph dev --port 2025`

### `langgraph.json` (Phase 1 — single graph)

```json
{
  "dependencies": ["."],
  "graphs": { "agent_auto_example_1": "./agent.py:graph" },
  "env": ".env"
}
```

> Note: graph ID was `"auto"` at initial implementation, then updated to `"agent_auto_example"`, then to `"agent_auto_example_1"` when Phase 2 was planned. The Phase 2 refactor moves graph code to `graphs/agent_auto_example_1.py` and updates this file accordingly.

### LangGraph Studio

**URL (LangSmith US account):**
```
https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2025
```

**Graph view trigger:**
```json
{"messages": [{"role": "user", "content": "start workflow"}]}
```

> The full state wrapper (`messages: [...]`) is required — the Studio appends the submitted JSON to the messages array, so a bare `{"role": "user", "content": "..."}` would result in an empty messages list hitting `router_node`.

**Triggering the workflow from Chat view:**

Send `start workflow` as a plain message. The Chat view is enabled by the use of `MessagesState`.

> Note: The Chat view wraps message content as a list of content blocks (`[{"type": "text", "text": "..."}]`) rather than a plain string. `router_node` handles both formats — if `content` is a list it extracts and joins the `text` fields before checking for `WORKFLOW_TRIGGER_MESSAGE`.

### `.env.example`

```
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_MODEL=gpt-4o-mini
LANGSMITH_API_KEY=your-langsmith-api-key-here
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
```

### Startup

```bash
cd agent-auto
cp .env.example .env
uv sync
uv run langgraph dev --port 2025
```

### Dependencies

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

## Phase 2 — Example Graph 2 (`agent_auto_example_2`)

### Goal

Add a second graph to the same `agent-auto` agent demonstrating a minimal trade matching pipeline. Scope is simulated only: no real data, no real HITL interrupt, random branch at the decision gateway. Real data, real HITL, and inter-node data passing are deferred to a future phase.

### Open Questions / Resolved

| # | Question | Resolution |
|---|---|---|
| 1 | Trigger message for Graph 2 | `"start workflow"` — same as Graph 1. See trigger design note above. |
| 2 | Post-HITL flow | After `simulated_hitl_manual_fix`, proceed directly to `auto_instruct` (no loop back). Note: in a real system the post-HITL step would typically loop back to re-run matching logic — returning to `fetch_ctm_status_node` or `match_decision_gateway_node` to confirm the analyst's fix resolved the exception before proceeding to settlement. This is deferred to a future phase; see Potential Future Enhancements. |
| 3 | `extract_oms_nodes` typo | Corrected to `extract_oms_trades`. |
| 4 | Frontend support for Graph 2 | Deferred — separate plan. This plan only updates frontend to keep Graph 1 working after rename. |

---

### File Structure Changes (Phase 2 refactor)

```
agent-auto/
├── agent.py                          # Becomes shared utilities only
├── graphs/
│   ├── agent_auto_example_1.py       # Moved from agent.py
│   └── agent_auto_example_2.py       # New
├── langgraph.json                    # Updated: two graphs
├── pyproject.toml                    # Unchanged
├── uv.lock                           # Unchanged
├── .python-version                   # Unchanged
├── .env.example                      # Unchanged
└── .env                              # Unchanged (gitignored)
```

---

### `agent.py` after refactor (shared utilities)

`agent.py` is stripped down to shared utilities imported by both graph files. It is no longer a graph entrypoint — `langgraph.json` points directly to the individual graph files.

```python
import logging
from datetime import datetime, timezone

logger = logging.getLogger("agent_auto")
logging.basicConfig(level=logging.INFO, format="%(message)s")

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

def _append_list(a: list | None, b: list) -> list:
    return (a or []) + b

def _merge_dicts(a: dict | None, b: dict) -> dict:
    return {**(a or {}), **b}
```

Both graph files import from `agent`:
```python
from agent import _now, _append_list, _merge_dicts, logger
```

---

### `langgraph.json` after refactor

```json
{
  "dependencies": ["."],
  "graphs": {
    "agent_auto_example_1": "./graphs/agent_auto_example_1.py:graph",
    "agent_auto_example_2": "./graphs/agent_auto_example_2.py:graph"
  },
  "env": ".env"
}
```

---

### Graph 2 Design

#### Workflow overview

Minimal Trade Matching pipeline. All steps are simulated (no real OMS/CTM data). The `match_decision_gateway` node makes a random "matched" / "exception" decision. `simulated_hitl_manual_fix` is a simulated-delay node — no real LangGraph `interrupt()` is used.

#### State

```python
class TradeMatchingState(MessagesState):
    status: str
    completed_steps: Annotated[list[str], _append_list]
    match_status: Optional[str]   # "matched" or "exception", set by match_decision_gateway
    step_timings: Annotated[dict, _merge_dicts]
```

#### Nodes

| Node | Friendly name | LLM prompt | Other work |
|---|---|---|---|
| `router_node` | — | No LLM call | Same trigger check pattern as Graph 1 |
| `extract_oms_trades_node` | Extract OMS Trades | "You are executing the Extract OMS Trades step of the Trade Matching workflow. Acknowledge that you are pulling executed trades and fund allocations from the OMS in one sentence." | Sleep, timestamps, completed_steps |
| `fetch_ctm_status_node` | Fetch CTM Status | "You are executing the Fetch CTM Status step of the Trade Matching workflow. Acknowledge that you are checking whether the broker's trade details have arrived and match in one sentence." | Sleep, timestamps, completed_steps |
| `match_decision_gateway_node` | Match Decision Gateway | "You are the Match Decision Gateway of the Trade Matching workflow. The system has randomly determined that the trade match status is {match_status}. Acknowledge this in one sentence." | `random.choice(["matched", "exception"])`, sleep, timestamps, set `match_status` |
| `simulated_hitl_manual_fix_node` | HITL Manual Fix | "You are executing the HITL Manual Fix step of the Trade Matching workflow. Acknowledge that a human analyst is investigating the trade mismatch in one sentence." | Sleep, timestamps, `completed_steps: ["simulated_hitl_manual_fix"]`. No real interrupt — this node remains a simulated-delay node in all future phases of Graph 2. Real HITL will be introduced in a separate future graph. |
| `auto_instruct_node` | Auto Instruct | "You are executing the Auto Instruct step of the Trade Matching workflow. Acknowledge that the matched trade is being enriched with SSI data and sent for settlement in one sentence." | Sleep, timestamps, completed_steps |
| `audit_finalize_node` | Audit Finalize | "You are executing the Audit Finalize step of the Trade Matching workflow. Acknowledge that the matching event has been logged and the OMS record updated to Ready for Settlement in one sentence." | Sleep, timestamps, completed_steps, status = "complete" |

#### Constants

```python
SIMULATED_STEP_DELAY_SECONDS = 2.0
WORKFLOW_TRIGGER_MESSAGE = "start workflow"
```

#### Edges

```
START → router_node
  ├─> extract_oms_trades_node  (status == "running")
  └─> END                      (unrecognised input)

extract_oms_trades_node ──> fetch_ctm_status_node
fetch_ctm_status_node   ──> match_decision_gateway_node

match_decision_gateway_node (conditional):
  ├─> auto_instruct_node    (match_status == "matched")
  └─> simulated_hitl_manual_fix_node  (match_status == "exception")

simulated_hitl_manual_fix_node ──> auto_instruct_node
auto_instruct_node   ──> audit_finalize_node
audit_finalize_node  ──> END
```

Both branches converge at `auto_instruct_node`. Explicit path maps on all `add_conditional_edges` calls for Studio visualisation compatibility.

#### Terminal Logging

```
[START] Extract OMS Trades    2026-05-16T14:05:00.123456+00:00
[LLM]   Extract OMS Trades    "I am pulling executed trades and fund allocations from the OMS."
[END]   Extract OMS Trades    2026-05-16T14:05:02.xxx
...
[END]   Match Decision Gateway 2026-05-16T14:05:07.xxx — match_status: exception
[START] HITL Manual Fix       2026-05-16T14:05:07.xxx
[LLM]   HITL Manual Fix       "A human analyst is investigating the trade mismatch."
[END]   HITL Manual Fix       2026-05-16T14:05:09.xxx
...
[END]   Audit Finalize        2026-05-16T14:05:14.xxx
Trade Matching workflow complete.
```

Logger name: `agent_auto`. Level: `INFO`. Format width `%-25s` (wider than Graph 1's `%-15s`) to accommodate longer node display names.

#### Implementation Notes

- `match_decision_gateway_node` and `simulated_hitl_manual_fix_node` are written as custom nodes (not via `_run_step`) — `match_decision_gateway_node` because it sets `match_status` in state; `simulated_hitl_manual_fix_node` because its `step_key` (`"simulated_hitl_manual_fix"`) must be hardcoded independently of its log display name (`"HITL Manual Fix"`).
- All other step nodes use the shared `_run_step` helper defined locally within `graph()`.
- Each LLM call uses `ChatOpenAI` with model from `OPENAI_MODEL` env var. The response content is appended to `messages` as an `AIMessage`.
- Node functions are `async`; use `asyncio.sleep` not `time.sleep`.

#### LangGraph Studio

**URL (LangSmith US account):**
```
https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2025
```

Select graph `agent_auto_example_2` from the graph picker.

**Graph view trigger:**
```json
{"messages": [{"role": "user", "content": "start workflow"}]}
```

> The full state wrapper (`messages: [...]`) is required — same constraint as Graph 1.

**Triggering the workflow from Chat view:**

Send `start workflow` as a plain message. The Chat view is enabled by the use of `MessagesState`. Same content-block handling as Graph 1 applies.

---

### Frontend updates required (Phase 2, to keep Graph 1 working)

The graph ID rename from `agent_auto_example` → `agent_auto_example_1` requires updates to three frontend files:

| File | Change |
|---|---|
| `frontend/app/api/copilotkit/route.ts` | Rename key `agent_auto_example` → `agent_auto_example_1` |
| `frontend/.env.local` | `NEXT_PUBLIC_DEFAULT_AUTONOMOUS_AGENT=agent_auto_example_1` |
| `frontend/.env.local.example` | Same |

No frontend support for Graph 2 in this plan — that is a separate plan.

---

### Files to Create/Modify (Phase 2)

| File | Action |
|---|---|
| `agent-auto/agent.py` | Modify — strip to shared utilities only |
| `agent-auto/graphs/agent_auto_example_1.py` | Create — moved from agent.py |
| `agent-auto/graphs/agent_auto_example_2.py` | Create — new trade matching graph |
| `agent-auto/langgraph.json` | Modify — two graphs, new paths |
| `frontend/app/api/copilotkit/route.ts` | Modify — rename graph ID |
| `frontend/.env.local` | Modify — rename graph ID |
| `frontend/.env.local.example` | Modify — rename graph ID |

---

## Potential Future Enhancements

- **MCP tools in step nodes:** Step nodes could call real tools (data-fetch, analysis), replacing no-op prompts with genuine reasoning.
- **HITL interrupts:** Real `interrupt()` calls, pausing execution for human approval, are planned for a dedicated future graph. Graph 2's `simulated_hitl_manual_fix_node` will remain a simulated-delay node in all future phases of that graph — real HITL is not an evolution of Graph 2.
- **Dynamic branch routing:** Replace random decisions with genuine LLM reasoning over prior step outputs.
- **Real data for Graph 2:** Wire `extract_oms_trades` and `fetch_ctm_status` to real or mock OMS/CTM data, and make `match_decision_gateway` a real matching logic step.
- **Real post-HITL loop in Graph 2:** After a human analyst resolves a trade exception, a real system would not proceed directly to settlement — it would loop back to re-run the matching logic (returning to `fetch_ctm_status_node` or `match_decision_gateway_node`) to confirm the fix resolved the exception before allowing `auto_instruct` to proceed. This would require a real `interrupt()` call in `simulated_hitl_manual_fix_node` and a loop-back edge, both deferred to a future phase.
- **Meta-dispatcher graph:** Rather than registering each graph as a separate `agentId` (the current architecture, where the frontend explicitly selects which graph to run), a single dispatcher graph could accept any trigger message on one `agentId` and route internally to the appropriate sub-graph based on message content — enabling domain-specific triggers (`"start trade matching"`, `"start example 1"`, etc.). This is a meaningfully different architecture and worth exploring as the number of graphs grows, though it adds complexity and the current multi-`agentId` approach is simpler and works well at small scale.
- **Mid-node start-time visibility:** Split nodes into start/end sub-nodes if the frontend needs to observe a node "starting" in real time via polling.

---

## What This Plan Does NOT Include

- Frontend support for Graph 2 — separate plan
- Real data or inter-node data passing in Graph 2 — deferred to a future phase
- Real HITL — planned for a dedicated future graph, not an evolution of Graph 2
- Any changes to `agent-convo/`
- MCP tools in either graph
