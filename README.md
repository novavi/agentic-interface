# Agentic Interface (Proof of concept)

Proof-of-concept frontend for agentic workflows.

# Prerequisites

- Python 3.14 installed
  - `uv python install 3.14`

# Install, Build and Run

## Agent - Conversational

A conversational LangGraph ReAct agent with an MCP tool, served via the LangGraph dev server.

```bash
cd agent-convo
cp .env.example .env          # then add your OPENAI_API_KEY to .env
uv sync                       # creates .venv and installs dependencies
uv run langgraph dev          # starts the server at http://localhost:2024
```
