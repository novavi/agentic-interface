import difflib
import json
from datetime import datetime

from mcp.server.fastmcp import FastMCP

from mock_data.stock_prices import ALIASES, MONTHS, STOCK_DATA

# Proof-of-concept: for simplicity the MCP server is co-located in this project and
# launched as a subprocess by the agent. For a real-world platform it would be a
# separate project hosted on its own endpoint, and the agent would connect to it
# over HTTP (SSE or streamable HTTP).
mcp = FastMCP("stock-data-server")

# Proof-of-concept: company name resolution uses simple difflib fuzzy matching. A
# real-world platform would use a proper entity resolution mechanism — e.g. a search
# index, a knowledge graph lookup, or an NER model — to map free-text input to
# canonical entity IDs reliably at scale.
FUZZY_CUTOFF = 0.6  # difflib similarity threshold (0–1); raise to tighten, lower to loosen

# Candidate pool for fuzzy matching: maps every matchable string → STOCK_DATA canonical key.
# Built once at import time from STOCK_DATA and ALIASES.
_CANDIDATES: dict[str, str] = {}
for _k in STOCK_DATA:
    _CANDIDATES[_k] = _k
for _alias, _canonical in ALIASES.items():
    _CANDIDATES[_alias] = _canonical
for _k, _v in STOCK_DATA.items():
    _CANDIDATES[_v["company"].lower()] = _k


def _resolve_company(name: str) -> str | None:
    """Return the STOCK_DATA canonical key for name, or None if no match at or above FUZZY_CUTOFF."""
    key = name.lower().strip()
    if key in STOCK_DATA:
        return key
    if key in ALIASES:
        return ALIASES[key]
    matches = difflib.get_close_matches(key, _CANDIDATES, n=1, cutoff=FUZZY_CUTOFF)
    if matches:
        return _CANDIDATES[matches[0]]
    return None


@mcp.tool(name="get-stock-data")
def get_stock_data(company_name: str) -> str:
    """Return monthly closing stock prices for a Magnificent 7 company.

    Args:
        company_name: Company name or ticker symbol (e.g. 'Apple', 'AAPL', 'Nvidia', 'NVDA')
    """
    canonical = _resolve_company(company_name)
    if canonical is None:
        valid = ", ".join(sorted(STOCK_DATA))
        return json.dumps({"error": f"Company '{company_name}' not found. Valid options: {valid}"})

    entry = STOCK_DATA[canonical]
    period_start = datetime.strptime(MONTHS[0], "%Y-%m").strftime("%b %Y")
    period_end = datetime.strptime(MONTHS[-1], "%Y-%m").strftime("%b %Y")
    return json.dumps({
        "company": entry["company"],
        "ticker": entry["ticker"],
        "currency": "USD",
        "summary": f"{entry['company']} ({entry['ticker']})\nClosing prices ({period_start} – {period_end})",
        "data": [
            {"month": month, "price": price}
            for month, price in zip(MONTHS, entry["prices"])
        ],
    })


if __name__ == "__main__":
    mcp.run()
