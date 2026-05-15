# Agentic Interface (Proof of concept)

Proof-of-concept frontend for agentic workflows.

# Prerequisites

- Node.js v24.11.0 or greater (nvm recommended for managing multiple Node.js versions)
- Python 3.14 installed
  - `uv python install 3.14`
- OpenAI account with an API key (used by all agents)
- LangSmith account with an API key (used by agent-auto for tracing); sign up at https://smith.langchain.com

# Install, Build and Run

## Agent - Conversational

A conversational LangGraph ReAct agent with an MCP tool, served via the LangGraph dev server.

```bash
cd agent-convo
cp .env.example .env          # then add your OPENAI_API_KEY to .env
uv sync                       # creates .venv and installs dependencies
uv run langgraph dev          # starts the server at http://localhost:2024
```

## Agent - Autonomous

An autonomous LangGraph agent that executes a multi-step workflow with a random branch decision, served via the LangGraph dev server.

```bash
cd agent-auto
cp .env.example .env               # then add your OPENAI_API_KEY and LANGSMITH_API_KEY to .env
uv sync                            # creates .venv and installs dependencies
uv run langgraph dev --port 2025   # starts the server at http://localhost:2025
```

> Note: agent-convo runs on port 2024 and agent-auto on port 2025 — both can be started simultaneously.

## Frontend

A chat UI built with Next.js and CopilotKit, connecting to the Agent - Conversational LangGraph agent.

```bash
cd frontend
cp .env.local.example .env.local   # already pre-filled with localhost default
npm install
npm run dev                        # starts on http://localhost:3000
```

> Note: `uv run langgraph dev` (agent-convo) must be running before starting the frontend so the `/api/copilotkit` route can reach the agent.
