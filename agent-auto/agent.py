import logging
from datetime import datetime, timezone

logger = logging.getLogger("agent_auto")
logging.basicConfig(level=logging.INFO, format="%(message)s")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _append_list(a: list | None, b: list) -> list:
    return (a or []) + b


def _merge_dicts(a: dict | None, b: dict) -> dict:
    return {**(a or {}), **b}
