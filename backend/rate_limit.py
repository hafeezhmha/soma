"""Small single-instance rate limiter for the public hackathon demo."""

from __future__ import annotations

from collections import defaultdict, deque
from threading import Lock
from time import monotonic


class RateLimiter:
    def __init__(self, *, limit: int, window_seconds: float):
        self.limit = limit
        self.window_seconds = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def allow(self, key: str) -> bool:
        now = monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            events = self._events[key]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= self.limit:
                return False
            events.append(now)
            return True
