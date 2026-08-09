"""API-level settings. Engine settings stay in `earnings.config`.

Nothing here duplicates a value that already lives in the engine's Settings —
DATABASE_URL, MASSIVE_API_KEY and friends are read through `earnings.config.
settings` so there is exactly one definition of each.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field


def _csv(name: str, default: str) -> list[str]:
    return [v.strip() for v in os.getenv(name, default).split(",") if v.strip()]


@dataclass(frozen=True)
class ApiSettings:
    # Browsers only need the Next.js dev server by default. Production origins
    # get appended via the env var rather than hardcoded.
    cors_origins: list[str] = field(
        default_factory=lambda: _csv("CORS_ORIGINS", "http://localhost:3000")
    )

    # A live refresh spends a metered Massive call, so it's rate limited per
    # client IP. See app/services/live.py.
    live_refresh_per_hour: int = int(os.getenv("LIVE_REFRESH_PER_HOUR", "10"))

    # How stale a dashboard snapshot may be before the UI labels it "stale"
    # rather than just showing its age. The nightly cron means a healthy
    # snapshot is <24h old; 36h allows for one missed run without alarming.
    snapshot_stale_after_hours: int = int(os.getenv("SNAPSHOT_STALE_AFTER_HOURS", "36"))

    debug: bool = os.getenv("API_DEBUG", "").lower() in ("1", "true", "yes")


api_settings = ApiSettings()
