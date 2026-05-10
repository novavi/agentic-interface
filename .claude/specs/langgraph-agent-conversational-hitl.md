# LangGraph Agent — Conversational - HITL

## Status
Implemented.

## Overview

Extends the conversational LangGraph agent (`langgraph-agent-conversational.md`) with a Human-in-the-Loop (HITL) flow for the `get info for <COMPANY_NAME>` prompt. When this prompt is detected, the agent pauses execution via a LangGraph interrupt and sends the frontend a list of available MCP tools with their default enabled state. The user can approve, modify, or reject the selection before the agent proceeds. Only the tools the user enabled are then called.

The existing agent (compiled via `create_agent`) is retained as a subgraph node for all standard queries. Both flows live in a single parent graph with a shared checkpointer.

No changes to `mcp_server.py`.

---

## Goals

- Support the prompt pattern `get info for <COMPANY_NAME>`, which invokes both `get-stock-data` and `get-company-overview`
- Before running those tools, pause execution with a LangGraph interrupt that exposes a tool selection payload to the frontend
- Resume based on the user's Approve / Modify / Reject choice:
  - **Approve**: run all tools in the interrupt payload (both enabled by default)
  - **Modify**: run only the tools the user left enabled
  - **Reject**: run no tools; agent responds with a polite acknowledgement
- All other prompts continue to use the existing `create_agent`-based flow unchanged, embedded as a subgraph

---

## Background: LangGraph Interrupts

LangGraph's `interrupt()` function pauses graph execution at a specific node and emits an interrupt event to the client. The graph remains suspended until a `Command(resume=<value>)` is sent by the client (via CopilotKit's `resolve()` mechanism). The resume value is the return value of the `interrupt()` call in Python.

CopilotKit forwards the interrupt event to the frontend as an `on_interrupt` custom event. The frontend handles it with the `useInterrupt` hook (see the frontend HITL plan).

---

## Assumption: Intent Detection

**Approach: simple substring match.**

The phrase `get info for` (case-insensitive) in the user's message triggers the HITL flow. Any other phrasing routes to the `create_agent` subgraph. This is deterministic and easy to test.

If LLM-based routing is preferred in future, the `route_node` below can be replaced with an LLM classification call. The rest of the architecture is unchanged.

---

## Interrupt Payload Design

The value passed to `interrupt()` in Python. Typed as a plain dict; the frontend parses `event.value`.

```python
{
    "type": "tool_selection",
    "company": "Apple",          # extracted from the user's message
    "tools": [
        {
            "id": "get-stock-data",
            "label": "Stock Price Data",
            "enabled": True
        },
        {
            "id": "get-company-overview",
            "label": "Company Overview Data",
            "enabled": True
        }
    ]
}
```

`type` allows the frontend to filter interrupts by type (in case other interrupt types are added later). `label` is the human-readable name displayed in the frontend dialog.

---

## Resume Value Design

The value sent back from the frontend via `resolve()`. The backend receives this as the return value of `interrupt()`.

```python
# Approve — use default selection (all enabled)
{"action": "approve", "enabled_tools": ["get-stock-data", "get-company-overview"]}

# Modify — use user's selection (subset)
{"action": "modify", "enabled_tools": ["get-stock-data"]}

# Reject — run nothing
{"action": "reject", "enabled_tools": []}
```

The backend only needs `enabled_tools` to decide which tools to call. `action` is included for clarity and to support future logging or branching.

---

## Graph Architecture

### Wrapper graph with `create_agent` subgraph

The existing agent is compiled via `create_agent` (from `langchain.agents`) and stored as `_compiled`. This compiled graph is used as a subgraph node inside a new parent `StateGraph`. The parent graph adds the HITL routing layer on top without replacing or modifying the existing agent logic.

Both flows — the HITL path and all standard queries — live in a single parent graph with a shared checkpointer. This means thread history is preserved seamlessly across both prompt types.

### Graph structure

```
START
  │
  ▼
route_node ──── "get_info" ────▶ interrupt_node
  │                                     │
  │ "standard"              "reject"    │  "approve"/"modify"
  │                            │        ▼
  │                            │  conditional_tool_node
  │                            │  (injects synthetic messages)
  │                            │        │
  │                            ▼        ▼
  │                        respond_node
  │                        (reject: canned msg │ success: direct LLM call, no tools)
  ▼                                │
agent_subgraph                     │
  │                                │
  ▼                                ▼
END ◀──────────────────────────────
```

**`route_node`**: Inspects the latest user message. If it contains `get info for` (case-insensitive), extracts the company name and routes to `interrupt_node`. Otherwise routes to `agent_subgraph`.

**`interrupt_node`**: Constructs the interrupt payload and calls `interrupt()`. Receives the resume value and stores it in state. If `action == "reject"`, routes to `respond_node`. Otherwise routes to `conditional_tool_node`.

**`conditional_tool_node`**: Calls only the MCP tools listed in `enabled_tools`. Injects synthetic `AIMessage(tool_calls=[...])` + `ToolMessage` entries into the messages state, then routes to `respond_node`.

**`respond_node`**: Handles both paths. Reject: returns a canned polite acknowledgement. Success: makes a direct LLM call (`_model.ainvoke`) with the system prompt prepended and no tools bound — the model can only generate text from the tool results already in state, preventing any further tool calls or hallucinated tool responses.

**`agent_subgraph`**: The compiled `create_agent` graph — handles standard non-HITL queries only. The `_compiled` value is passed as the node callable.

---

## State Schema

```python
from typing import Optional
from langgraph.graph import MessagesState

class HITLState(MessagesState):
    company_name: Optional[str]
    interrupt_result: Optional[dict]
```

`MessagesState` provides the `messages` field with the append reducer. The extra fields are plain (last-write-wins). `tool_results` is not stored in state — tool results go directly into `messages` as synthetic `AIMessage` + `ToolMessage` pairs.

---

## File Changes

```
agent-convo/
└── agent.py    # MODIFIED — wrap create_agent graph in parent HITL StateGraph
```

No other files change. `mcp_server.py` and mock data are unchanged.

---

## `agent.py` Changes

### Imports to add

```python
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.types import interrupt, Command
from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
from typing import Optional
import re
import uuid
```

New module-level variables alongside the existing `_compiled` and `_tool_map`:

```python
_model = None    # ChatOpenAI instance, stored for use in respond_node
```

### `_message_text` helper and `route_node`

LangGraph Studio and CopilotKit send messages where `.content` may be a list of content blocks (`[{"type": "text", "text": "..."}]`) rather than a plain string. `_message_text` normalises both forms.

```python
GET_INFO_PATTERN = re.compile(r"get info for (.+)", re.IGNORECASE)


def _message_text(content) -> str:
    if isinstance(content, list):
        return " ".join(
            b.get("text", "") if isinstance(b, dict) else str(b) for b in content
        )
    return content


def route_node(state: HITLState) -> Command:
    last_user_message = next(
        (m for m in reversed(state["messages"]) if m.type == "human"), None
    )
    if last_user_message:
        match = GET_INFO_PATTERN.search(_message_text(last_user_message.content))
        if match:
            company = match.group(1).strip()
            return Command(
                update={"company_name": company},
                goto="interrupt_node",
            )
    return Command(goto="agent_subgraph")
```

### `interrupt_node`

```python
def interrupt_node(state: HITLState) -> Command:
    company = state["company_name"]
    resume = interrupt({
        "type": "tool_selection",
        "company": company,
        "tools": [
            {"id": "get-stock-data",       "label": "Stock Price Data",       "enabled": True},
            {"id": "get-company-overview",  "label": "Company Overview Data",  "enabled": True},
        ],
    })
    return Command(
        update={"interrupt_result": resume},
        goto="respond_node" if resume["action"] == "reject" else "conditional_tool_node",
    )
```

### `conditional_tool_node`

Tools are called via `_tool_map`, which is populated during `graph()` init from `MultiServerMCPClient.get_tools()`. The `"type": "tool_call"` field is required for correct `AIMessage` serialisation.

```python
async def conditional_tool_node(state: HITLState) -> Command:
    company = state["company_name"]
    enabled = set(state["interrupt_result"]["enabled_tools"])
    new_messages = []

    tool_calls = []
    if "get-stock-data" in enabled:
        tool_calls.append({
            "name": "get-stock-data",
            "args": {"company_name": company},
            "id": str(uuid.uuid4()),
            "type": "tool_call",
        })
    if "get-company-overview" in enabled:
        tool_calls.append({
            "name": "get-company-overview",
            "args": {"company_name": company},
            "id": str(uuid.uuid4()),
            "type": "tool_call",
        })

    new_messages.append(AIMessage(content="", tool_calls=tool_calls))

    for tc in tool_calls:
        result = await _tool_map[tc["name"]].ainvoke(tc["args"])
        new_messages.append(ToolMessage(content=str(result), tool_call_id=tc["id"], name=tc["name"]))

    return Command(
        update={"messages": new_messages},
        goto="respond_node",
    )
```

### `respond_node`

Handles both the reject path (canned message) and the HITL success path (direct LLM call with no tools bound, preventing extra tool calls or hallucinated responses).

```python
async def respond_node(state: HITLState) -> dict:
    result = state.get("interrupt_result") or {}

    if result.get("action") == "reject":
        company = state["company_name"]
        msg = (
            f"Understood — I won't retrieve any information for {company}. "
            "Let me know if there's anything else I can help with."
        )
        return {"messages": [AIMessage(content=msg)]}

    # Direct LLM call with no tools bound — model can only generate text, not call more tools
    response = await _model.ainvoke(
        [SystemMessage(content=_SYSTEM_PROMPT)] + state["messages"]
    )
    return {"messages": [response]}
```

### Graph assembly

Explicit `add_edge` calls are needed for nodes that return a plain dict (not a `Command`). Nodes that return `Command(goto=...)` handle their own routing. No checkpointer is passed — `langgraph dev` injects one at runtime.

```python
builder = StateGraph(HITLState)

builder.add_node("route_node", route_node)
builder.add_node("interrupt_node", interrupt_node)
builder.add_node("conditional_tool_node", conditional_tool_node)
builder.add_node("respond_node", respond_node)
builder.add_node("agent_subgraph", _compiled)

builder.add_edge(START, "route_node")
builder.add_edge("respond_node", END)
builder.add_edge("agent_subgraph", END)

_wrapper = builder.compile()
```

---

## Testing in LangGraph Studio

LangGraph Studio (the UI served by `langgraph dev` at `https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024`) supports testing interrupt flows without the frontend. When the graph hits `interrupt()`, Studio pauses the run and shows the interrupt payload. You can provide the resume value as JSON to continue.

1. Start a new thread in Studio
2. Send `get info for Apple`
3. The graph pauses at `interrupt_node` — Studio shows the `tool_selection` payload
4. Paste one of the following as the resume value and submit:

**Approve** (both tools):
```json
{"action": "approve", "enabled_tools": ["get-stock-data", "get-company-overview"]}
```

**Modify** (one tool only):
```json
{"action": "modify", "enabled_tools": ["get-stock-data"]}
```

**Reject**:
```json
{"action": "reject", "enabled_tools": []}
```

Standard queries (e.g. `get stock price for Apple`) should bypass the interrupt entirely and route straight to `agent_subgraph`.

---

## Implementation Notes

- **Direct MCP tool calling**: Resolved. `MultiServerMCPClient.get_tools()` returns standard LangChain tool objects. These are stored in module-level `_tool_map: dict` (keyed by tool name) during `graph()` initialisation, and called in `conditional_tool_node` via `await _tool_map[name].ainvoke(args)`.
- **Checkpointer**: Not passed explicitly to `builder.compile()` — `langgraph dev` injects one at runtime. This is consistent with the existing pattern.
- **Why `respond_node` not `agent_subgraph` for HITL success**: Routing back to `agent_subgraph` after tool injection caused two bugs: (1) the agent called additional tools beyond the user's selection; (2) the LLM hallucinated tool response text for tools that weren't called. Fixed by making a direct `_model.ainvoke` call in `respond_node` with the system prompt but no tools bound — the model generates text only.
- **`message.content` as list**: LangGraph Studio (and CopilotKit) send messages where `.content` is a list of content blocks rather than a plain string. `_message_text()` normalises both forms before the regex search.

---

## Acceptance Criteria

- [x] `get info for Apple` (and equivalent company names) triggers the LangGraph interrupt before any tools are called
- [x] The interrupt payload contains both tools with `enabled: True`
- [x] On Approve, both `get-stock-data` and `get-company-overview` are called; stock chart and overview card render in the frontend
- [x] On Modify with only one tool selected, only that tool is called; only its corresponding renderer fires
- [x] On Reject, no tools are called; agent responds with a polite acknowledgement message
- [x] Standard prompts (e.g. `get stock price for Apple`, `what is Apple's overview?`) continue to work via the `agent_subgraph` — no regression
- [x] All existing acceptance criteria from `langgraph-agent-conversational.md` continue to pass
