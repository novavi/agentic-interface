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


class TradeMatchingState(MessagesState):
    status: str
    completed_steps: Annotated[list[str], _append_list]
    match_status: Optional[str]  # "matched" or "exception", set by match_decision_gateway_node
    step_timings: Annotated[dict, _merge_dicts]


async def graph():
    load_dotenv()
    llm = ChatOpenAI(model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"))

    async def router_node(state: TradeMatchingState) -> dict:
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
            return {"status": "running"}
        return {
            "status": "idle",
            "messages": [AIMessage(content=f"Send '{WORKFLOW_TRIGGER_MESSAGE}' to begin the Example 2 Workflow.")],
        }

    def route_from_router(state: TradeMatchingState) -> str:
        return "extract_oms_trades_node" if state.get("status") == "running" else END

    async def _run_step(name: str, prompt: str) -> tuple[str, str, str, str]:
        step_key = name.lower().replace(" ", "_")
        started_at = _now()
        logger.info("[START] %-25s %s", name, started_at)

        response = await llm.ainvoke([{"role": "user", "content": prompt}])
        llm_content = response.content
        logger.info('[LLM]   %-25s "%s"', name, llm_content)

        await asyncio.sleep(SIMULATED_STEP_DELAY_SECONDS)

        completed_at = _now()
        logger.info("[END]   %-25s %s", name, completed_at)

        return step_key, started_at, llm_content, completed_at

    async def extract_oms_trades_node(state: TradeMatchingState) -> dict:
        key, started, content, completed = await _run_step(
            "Extract OMS Trades",
            "You are executing the Extract OMS Trades step of the Example 2 Workflow. Acknowledge that you are pulling executed trades and fund allocations from the OMS in one sentence.",
        )
        return {
            "messages": [AIMessage(content=content)],
            "completed_steps": ["extract_oms_trades"],
            "step_timings": {f"{key}_started_at": started, f"{key}_completed_at": completed},
        }

    async def fetch_ctm_status_node(state: TradeMatchingState) -> dict:
        key, started, content, completed = await _run_step(
            "Fetch CTM Status",
            "You are executing the Fetch CTM Status step of the Example 2 Workflow. Acknowledge that you are checking whether the broker's trade details have arrived and match in one sentence.",
        )
        return {
            "messages": [AIMessage(content=content)],
            "completed_steps": ["fetch_ctm_status"],
            "step_timings": {f"{key}_started_at": started, f"{key}_completed_at": completed},
        }

    async def match_decision_gateway_node(state: TradeMatchingState) -> dict:
        step_key = "match_decision_gateway"
        started_at = _now()
        logger.info("[START] %-25s %s", "Match Decision Gateway", started_at)

        match_status = random.choice(["matched", "exception"])

        response = await llm.ainvoke([{
            "role": "user",
            "content": (
                f"You are the Match Decision Gateway of the Example 2 Workflow. "
                f"The system has randomly determined that the trade match status is {match_status}. "
                "Acknowledge this in one sentence."
            ),
        }])
        llm_content = response.content
        logger.info('[LLM]   %-25s "%s"', "Match Decision Gateway", llm_content)

        await asyncio.sleep(SIMULATED_STEP_DELAY_SECONDS)

        completed_at = _now()
        logger.info("[END]   %-25s %s — match_status: %s", "Match Decision Gateway", completed_at, match_status)

        return {
            "messages": [AIMessage(content=llm_content)],
            "completed_steps": ["match_decision_gateway"],
            "match_status": match_status,
            "step_timings": {
                f"{step_key}_started_at": started_at,
                f"{step_key}_completed_at": completed_at,
            },
        }

    def route_after_match_decision(state: TradeMatchingState) -> str:
        return "auto_instruct_node" if state["match_status"] == "matched" else "simulated_hitl_manual_fix_node"

    async def simulated_hitl_manual_fix_node(state: TradeMatchingState) -> dict:
        step_key = "simulated_hitl_manual_fix"
        started_at = _now()
        logger.info("[START] %-25s %s", "HITL Manual Fix", started_at)

        response = await llm.ainvoke([{
            "role": "user",
            "content": "You are executing the HITL Manual Fix step of the Example 2 Workflow. Acknowledge that a human analyst is investigating the trade mismatch in one sentence.",
        }])
        llm_content = response.content
        logger.info('[LLM]   %-25s "%s"', "HITL Manual Fix", llm_content)

        await asyncio.sleep(SIMULATED_STEP_DELAY_SECONDS)

        completed_at = _now()
        logger.info("[END]   %-25s %s", "HITL Manual Fix", completed_at)

        return {
            "messages": [AIMessage(content=llm_content)],
            "completed_steps": [step_key],
            "step_timings": {
                f"{step_key}_started_at": started_at,
                f"{step_key}_completed_at": completed_at,
            },
        }

    async def auto_instruct_node(state: TradeMatchingState) -> dict:
        key, started, content, completed = await _run_step(
            "Auto Instruct",
            "You are executing the Auto Instruct step of the Example 2 Workflow. Acknowledge that the matched trade is being enriched with SSI data and sent for settlement in one sentence.",
        )
        return {
            "messages": [AIMessage(content=content)],
            "completed_steps": ["auto_instruct"],
            "step_timings": {f"{key}_started_at": started, f"{key}_completed_at": completed},
        }

    async def audit_finalize_node(state: TradeMatchingState) -> dict:
        key, started, content, completed = await _run_step(
            "Audit Finalize",
            "You are executing the Audit Finalize step of the Example 2 Workflow. Acknowledge that the matching event has been logged and the OMS record updated to Ready for Settlement in one sentence.",
        )
        logger.info("Example 2 Workflow complete.")
        return {
            "messages": [AIMessage(content=content)],
            "completed_steps": ["audit_finalize"],
            "status": "complete",
            "step_timings": {f"{key}_started_at": started, f"{key}_completed_at": completed},
        }

    builder = StateGraph(TradeMatchingState)

    builder.add_node("router_node", router_node)
    builder.add_node("extract_oms_trades_node", extract_oms_trades_node)
    builder.add_node("fetch_ctm_status_node", fetch_ctm_status_node)
    builder.add_node("match_decision_gateway_node", match_decision_gateway_node)
    builder.add_node("simulated_hitl_manual_fix_node", simulated_hitl_manual_fix_node)
    builder.add_node("auto_instruct_node", auto_instruct_node)
    builder.add_node("audit_finalize_node", audit_finalize_node)

    builder.add_edge(START, "router_node")
    builder.add_conditional_edges(
        "router_node",
        route_from_router,
        ["extract_oms_trades_node", END],
    )
    builder.add_edge("extract_oms_trades_node", "fetch_ctm_status_node")
    builder.add_edge("fetch_ctm_status_node", "match_decision_gateway_node")
    builder.add_conditional_edges(
        "match_decision_gateway_node",
        route_after_match_decision,
        ["auto_instruct_node", "simulated_hitl_manual_fix_node"],
    )
    builder.add_edge("simulated_hitl_manual_fix_node", "auto_instruct_node")
    builder.add_edge("auto_instruct_node", "audit_finalize_node")
    builder.add_edge("audit_finalize_node", END)

    return builder.compile()
