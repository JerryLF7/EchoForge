from __future__ import annotations

import time
from collections.abc import Callable
from typing import TypeVar

from echoforge.errors import TingwuTaskError


T = TypeVar("T")


def poll_until(
    fetcher: Callable[[], T],
    *,
    get_status: Callable[[T], str],
    get_message: Callable[[T], str | None] | None = None,
    poll_interval_seconds: int = 5,
    slow_interval_seconds: int = 15,
    timeout_seconds: int = 600,
    clock: Callable[[], float] = time.monotonic,
    sleeper: Callable[[float], None] = time.sleep,
) -> T:
    start = clock()
    while True:
        result = fetcher()
        status = get_status(result)
        if status == "completed":
            return result
        if status == "failed":
            message = get_message(result) if get_message is not None else None
            detail = f": {message}" if message else ""
            raise TingwuTaskError(f"Tingwu task failed{detail}")

        elapsed = clock() - start
        if elapsed >= timeout_seconds:
            raise TingwuTaskError(f"Tingwu task timed out after {timeout_seconds} seconds")

        interval = poll_interval_seconds if elapsed < 30 else slow_interval_seconds
        sleeper(interval)
