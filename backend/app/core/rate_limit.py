"""In-memory sliding-window limiter for failed login attempts.

Per-process only. With several backend instances use a shared store (Redis)
so counters are global - see the scalability section of the README.
"""

import time
from collections import deque

from app.core.config import settings
from app.core.exceptions import RateLimitError


class FailedAttemptLimiter:
    def __init__(self, max_attempts: int, window_seconds: int) -> None:
        self.max_attempts = max_attempts
        self.window = window_seconds
        self._failures: dict[str, deque[float]] = {}

    def _prune(self, key: str, now: float) -> deque[float]:
        q = self._failures.get(key)
        if q is None:
            return deque()
        while q and now - q[0] > self.window:
            q.popleft()
        if not q:
            self._failures.pop(key, None)
        return q

    def retry_after(self, key: str) -> int:
        """Seconds until the key may try again; 0 when it is not blocked."""
        now = time.monotonic()
        q = self._prune(key, now)
        if len(q) < self.max_attempts:
            return 0
        return max(1, int(self.window - (now - q[0])) + 1)

    def check(self, key: str) -> None:
        wait = self.retry_after(key)
        if wait:
            minutes = max(1, round(wait / 60))
            raise RateLimitError(
                f"Too many failed login attempts. Try again in {minutes} minute(s).",
                code="too_many_attempts",
                details={"retry_after_seconds": wait},
                headers={"Retry-After": str(wait)},
            )

    def register_failure(self, key: str) -> None:
        now = time.monotonic()
        self._prune(key, now)
        self._failures.setdefault(key, deque()).append(now)

    def reset(self, key: str) -> None:
        self._failures.pop(key, None)

    def clear(self) -> None:
        self._failures.clear()


# Per-username limit: stops password guessing against one account.
login_user_limiter = FailedAttemptLimiter(
    settings.login_rate_limit_attempts, settings.login_rate_limit_window_seconds
)
# Per-IP limit: stops spraying many usernames from one address. It is looser
# (4x) because several legitimate users may share one NAT address.
login_ip_limiter = FailedAttemptLimiter(
    settings.login_rate_limit_attempts * 4, settings.login_rate_limit_window_seconds
)


def reset_login_limiters() -> None:
    login_user_limiter.clear()
    login_ip_limiter.clear()
