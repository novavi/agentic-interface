import asyncio
import os
import random
from typing import Annotated, Optional

from dotenv import load_dotenv
from langchain_core.messages import AIMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, MessagesState, StateGraph

from agent import _append_list, _merge_dicts, _now, logger

SIMULATED_STEP_DELAY_SECONDS = 2.0
WORKFLOW_TRIGGER_MESSAGE = "start workflow"


class WorkflowState(MessagesState):
    status: str
    completed_steps: Annotated[list[str], _append_list]
    decision: Optional[str]
    step_timings: Annotated[dict, _merge_dicts]


async def graph():
    load_dotenv()
    llm = ChatOpenAI(model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"))

    async def router_node(state: WorkflowState) -> dict:
        messages = state.get("messages") or []
        last = messages[-1] if messages else None
        raw = getattr(last, "content", "") or ""
        if isinstance(raw, list):
            content = " ".join(
                block.get("text", "") if isinstance(block, dict) else str(block)
                for block in raw
            )
        else:
            content = raw
        if WORKFLOW_TRIGGER_MESSAGE in content.lower():
            return {"status": "running", "completed_steps": ["router"]}
        return {
            "status": "idle",
            "messages": [AIMessage(content=f"Send '{WORKFLOW_TRIGGER_MESSAGE}' to begin the Example 1 Workflow.")],
        }

    def route_from_router(state: WorkflowState) -> str:
        return "step_1_node" if state.get("status") == "running" else END

    async def _run_step(name: str, prompt: str) -> tuple[str, str, str, str]:
        step_key = name.lower().replace(" ", "_")
        started_at = _now()
        logger.info("[START] %-15s %s", name, started_at)

        response = await llm.ainvoke([{"role": "user", "content": prompt}])
        llm_content = response.content
        logger.info('[LLM]   %-15s "%s"', name, llm_content)

        await asyncio.sleep(SIMULATED_STEP_DELAY_SECONDS)

        completed_at = _now()
        logger.info("[END]   %-15s %s", name, completed_at)

        return step_key, started_at, llm_content, completed_at

    async def step_1_node(state: WorkflowState) -> dict:
        key, started, content, completed = await _run_step(
            "Step 1",
            "You are executing Step 1 of the Example 1 Workflow. Acknowledge that you are processing this step in one sentence.",
        )
        return {
            "messages": [AIMessage(content=content)],
            "completed_steps": ["step_1"],
            "step_timings": {f"{key}_started_at": started, f"{key}_completed_at": completed},
        }

    async def step_2_node(state: WorkflowState) -> dict:
        key, started, content, completed = await _run_step(
            "Step 2",
            "You are executing Step 2 of the Example 1 Workflow. Acknowledge that you are processing this step in one sentence.",
        )
        return {
            "messages": [AIMessage(content=content)],
            "completed_steps": ["step_2"],
            "step_timings": {f"{key}_started_at": started, f"{key}_completed_at": completed},
        }

    async def step_3_node(state: WorkflowState) -> dict:
        key, started, content, completed = await _run_step(
            "Step 3",
            "You are executing Step 3 of the Example 1 Workflow. Acknowledge that you are processing this step in one sentence.",
        )
        return {
            "messages": [AIMessage(content=content)],
            "completed_steps": ["step_3"],
            "step_timings": {f"{key}_started_at": started, f"{key}_completed_at": completed},
        }

    async def decision_node(state: WorkflowState) -> dict:
        step_key = "decision"
        started_at = _now()
        logger.info("[START] %-15s %s", "Decision Step", started_at)

        decision = random.choice(["4a", "4b"])

        response = await llm.ainvoke([{
            "role": "user",
            "content": (
                f"You are the Decision Step of the Example 1 Workflow. "
                f"The workflow has randomly selected branch {decision}. "
                "Acknowledge this decision in one sentence."
            ),
        }])
        llm_content = response.content
        logger.info('[LLM]   %-15s "%s"', "Decision Step", llm_content)

        await asyncio.sleep(SIMULATED_STEP_DELAY_SECONDS)

        completed_at = _now()
        logger.info("[END]   %-15s %s — branch: %s", "Decision Step", completed_at, decision)

        return {
            "messages": [AIMessage(content=llm_content)],
            "completed_steps": ["decision"],
            "decision": decision,
            "step_timings": {
                f"{step_key}_started_at": started_at,
                f"{step_key}_completed_at": completed_at,
            },
        }

    def route_after_decision(state: WorkflowState) -> str:
        return "step_4a_node" if state["decision"] == "4a" else "step_4b_node"

    async def step_4a_node(state: WorkflowState) -> dict:
        key, started, content, completed = await _run_step(
            "Step 4a",
            "You are executing Step 4a (branch A) of the Example 1 Workflow. This is the final step. Acknowledge completion in one sentence.",
        )
        logger.info("Workflow complete.")
        return {
            "messages": [AIMessage(content=content)],
            "completed_steps": ["step_4a"],
            "status": "complete",
            "step_timings": {f"{key}_started_at": started, f"{key}_completed_at": completed},
        }

    async def step_4b_node(state: WorkflowState) -> dict:
        key, started, content, completed = await _run_step(
            "Step 4b",
            "You are executing Step 4b (branch B) of the Example 1 Workflow. This is the final step. Acknowledge completion in one sentence.",
        )
        logger.info("Workflow complete.")
        return {
            "messages": [AIMessage(content=content)],
            "completed_steps": ["step_4b"],
            "status": "complete",
            "step_timings": {f"{key}_started_at": started, f"{key}_completed_at": completed},
        }

    builder = StateGraph(WorkflowState)

    builder.add_node("router_node", router_node)
    builder.add_node("step_1_node", step_1_node)
    builder.add_node("step_2_node", step_2_node)
    builder.add_node("step_3_node", step_3_node)
    builder.add_node("decision_node", decision_node)
    builder.add_node("step_4a_node", step_4a_node)
    builder.add_node("step_4b_node", step_4b_node)

    builder.add_edge(START, "router_node")
    builder.add_conditional_edges(
        "router_node",
        route_from_router,
        ["step_1_node", END],
    )
    builder.add_edge("step_1_node", "step_2_node")
    builder.add_edge("step_2_node", "step_3_node")
    builder.add_edge("step_3_node", "decision_node")
    builder.add_conditional_edges(
        "decision_node",
        route_after_decision,
        ["step_4a_node", "step_4b_node"],
    )
    builder.add_edge("step_4a_node", END)
    builder.add_edge("step_4b_node", END)

    return builder.compile()
