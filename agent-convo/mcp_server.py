import json
from datetime import datetime

from mcp.server.fastmcp import FastMCP

from mock_data.stock_prices import ALIASES, MONTHS, STOCK_DATA

mcp = FastMCP("stock-data-server")


@mcp.tool(name="get-stock-data")
def get_stock_data(company_name: str) -> str:
    """Return monthly closing stock prices for a Magnificent 7 company.

    Args:
        company_name: Company name or ticker symbol (e.g. 'Apple', 'AAPL', 'Nvidia', 'NVDA')
    """
    key = company_name.lower().strip()
    key = ALIASES.get(key, key)

    entry = STOCK_DATA.get(key)
    if entry is None:
        valid = ", ".join(sorted(STOCK_DATA))
        return json.dumps({"error": f"Company '{company_name}' not found. Valid options: {valid}"})

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
