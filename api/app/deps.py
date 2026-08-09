"""FastAPI dependencies."""

from __future__ import annotations

from collections.abc import Iterator

from earnings.store.db import session_scope
from fastapi import HTTPException
from sqlalchemy.orm import Session


def get_session() -> Iterator[Session]:
    """Request-scoped DB session, reusing the engine's own session factory.

    `session_scope` commits on clean exit. Read-only handlers make that a
    no-op; the live-refresh path genuinely writes (it caches option snapshots),
    so the commit is load-bearing and not worth optimising away.
    """
    with session_scope() as session:
        yield session


def require_db() -> None:
    """Guard for routes that can't degrade gracefully without Postgres.

    `settings.has_db` is False when DATABASE_URL is unset and the engine has
    fallen back to its localhost default — starting up in that state is fine
    (health checks still work), serving a ticker page from it is not.
    """
    from earnings.config import settings

    if not settings.has_db:
        raise HTTPException(
            status_code=503,
            detail="DATABASE_URL is not configured — see EarningsDesk/.env.example",
        )
