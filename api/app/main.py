"""FastAPI app factory.

`bootstrap` is imported first and on its own line — it populates os.environ
before `earnings.config` reads it at import time. Do not reorder; ruff's
import sorter is told to leave it alone via the noqa below.
"""

from __future__ import annotations

from app import bootstrap  # noqa: I001  — must precede any `earnings` import

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import api_settings

__all__ = ["create_app", "app"]


def _engine_available() -> tuple[bool, str]:
    """Is the sibling `earnings` package importable?

    Checked at startup rather than at first request so a misconfigured install
    fails loudly on boot instead of as a 500 three pages into a demo.
    """
    try:
        import earnings  # noqa: F401
    except ImportError as exc:
        return False, str(exc)
    return True, ""


def create_app() -> FastAPI:
    app = FastAPI(
        title="EarningsDesk API",
        version="0.1.0",
        description="Read-only earnings + options data for the EarningsDesk dashboard.",
        debug=api_settings.debug,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=api_settings.cors_origins,
        allow_credentials=False,  # no cookies/auth yet; keep it off until there are
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    @app.get("/healthz", tags=["meta"])
    def healthz() -> dict:
        """Liveness + configuration report.

        Deliberately reports *which* feature flags are off rather than just
        ok/not-ok: the most likely failure here is a silently unloaded .env,
        which looks identical to a healthy app until you request real data.
        """
        engine_ok, engine_err = _engine_available()

        payload: dict = {
            "status": "ok" if engine_ok else "degraded",
            "env_files_loaded": [str(p) for p in bootstrap.LOADED_ENV_FILES],
        }

        if not engine_ok:
            payload["error"] = (
                f"`earnings` package not importable ({engine_err}). "
                "Run: pip install -e ../../Earnings/Earnings"
            )
            return payload

        from earnings.config import settings

        payload["engine"] = {
            "db": settings.has_db,
            "massive": settings.has_massive,
            "llm": settings.has_llm,
        }
        return payload

    # Imported inside the factory so a broken `earnings` install surfaces via
    # /healthz's readable message rather than an ImportError at module load.
    from app.routers import router

    app.include_router(router, prefix="/api")

    return app


app = create_app()
