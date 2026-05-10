import os
import sys
import re
import uuid
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain.agents import create_agent
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.types import interrupt, Command
from langchain_core.messages import AIMessage, SystemMessage, ToolMessage

load_dotenv()

_MCP_SERVER = str(Path(__file__).parent / "mcp_server.py")
_compiled = None   # inner create_agent graph
_wrapper = None    # outer HITL wrapper graph (returned by graph())
_tool_map: dict = {}
_model = None

_SYSTEM_PROMPT = """You are a helpful assistant with access to stock price data and \
company overview information for the Magnificent 7 companies: Apple, Microsoft, \
Alphabet (Google), Amazon, Meta, Tesla, and Nvidia.

When you retrieve stock price data, a chart is rendered automatically in the UI — do not \
list individual data points in your response. Instead, reply with a concise 2–3 sentence \
summary that covers: the company name and ticker, the period covered, the first and last \
weekly closing prices, and the highest and lowest weekly closing prices. Use the \
precomputed fields `first_price`, `last_price`, `high_price`, and `low_price` from the tool \
result directly — do not derive these values yourself from the data array.

When you retrieve a company overview, an info card is rendered automatically in the UI — \
do not repeat the overview details in your response. Instead, reply with a single brief \
line, for example: "Here is the company overview for Apple Inc.\""""


GET_INFO_PATTERN = re.compile(r"get info for (.+)", re.IGNORECASE)


class HITLState(MessagesState):
    company_name: Optional[str]
    interrupt_result: Optional[dict]


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


def interrupt_node(state: HITLState) -> Command:
    company = state["company_name"]
    resume = interrupt({
        "type": "tool_selection",
        "company": company,
        "tools": [
            {"id": "get-stock-data",      "label": "Stock Price Data",      "enabled": True},
            {"id": "get-company-overview", "label": "Company Overview Data", "enabled": True},
        ],
    })
    return Command(
        update={"interrupt_result": resume},
        goto="respond_node" if resume["action"] == "reject" else "conditional_tool_node",
    )


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


async def graph():
    """Async factory — initialised once, reused for the lifetime of the server process."""
    global _compiled, _wrapper, _tool_map, _model
    if _wrapper is not None:
        return _wrapper

    # Proof-of-concept: for simplicity the MCP server is co-located in this project and
    # launched as a subprocess over stdio. For a real-world platform it would be a
    # separate project hosted on its own endpoint, and the client would connect to it
    # over HTTP (SSE or streamable HTTP).
    client = MultiServerMCPClient(
        {
            "stock": {
                "command": sys.executable,
                "args": [_MCP_SERVER],
                "transport": "stdio",
            }
        }
    )
    tools = await client.get_tools()
    _tool_map = {t.name: t for t in tools}

    _model = ChatOpenAI(model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"))
    _compiled = create_agent(_model, tools, system_prompt=_SYSTEM_PROMPT)

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
    return _wrapper
