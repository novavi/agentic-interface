# Agentic Interface (Proof of concept)

Proof-of-concept frontend for agentic workflows.

# Prerequisites

- Node.js v24.11.0 or greater (nvm recommended)
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

## Frontend

A chat UI built with Next.js and CopilotKit, connecting to the Agent - Conversational LangGraph agent.

```bash
cd frontend
cp .env.local.example .env.local    # already pre-filled with localhost default
npm install
npm run dev                         # starts on http://localhost:3000
```

> Note: `uv run langgraph dev` (agent-convo) must be running before starting the frontend so the `/api/copilotkit` route can reach the agent.
