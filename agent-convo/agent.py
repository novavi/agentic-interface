import os
import sys  # sys.executable ensures we use the venv Python for the MCP subprocess
from pathlib import Path

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain.agents import create_agent

load_dotenv()

_MCP_SERVER = str(Path(__file__).parent / "mcp_server.py")
_compiled = None

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


async def graph():
    """Async factory — initialised once, reused for the lifetime of the server process."""
    global _compiled
    if _compiled is not None:
        return _compiled

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

    model = ChatOpenAI(model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"))
    _compiled = create_agent(model, tools, system_prompt=_SYSTEM_PROMPT)
    return _compiled
