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
    _compiled = create_agent(model, tools)
    return _compiled
