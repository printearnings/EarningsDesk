"""Serialize every page to static JSON for Cloudflare Pages.

Cloudflare Workers can't run this API — Pyodide has no psycopg driver and no
yfinance. So the heavy Python stays where it already runs (GitHub Actions,
nightly) and ships its output as files. The frontend fetches those files; there
is no server in production.

Uses the exact same functions as app.routers, so the static payload and the dev
server can't drift apart.

Run:  python -m app.dump_json --out ../web/public/data
"""

from __future__ import annotations

import argparse
import json
import logging
import math
from pathlib import Path

from app import bootstrap  # noqa: I001,F401  — must precede any `earnings` import

from earnings.store import repo
from earnings.store.db import session_scope
from pydantic import BaseModel

from app.routers import (
    DEFAULT_WINDOW_DAYS,
    _calendar,
    _calendar_full,
    _dashboard_news,
    _index,
    _past_earnings,
    _signals,
)
from app.services import pages, quotes

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("dump_json")

# The calendar page offers a window selector, so bake each option rather than
# making the client filter a single blob — these files are a few KB each.
CALENDAR_WINDOWS = (7, 14, 30, 90)


def _sanitize_nan(value):
    """Replace NaN/Infinity with None, recursively.

    `model_dump(mode="json")` passes a Python float through unchanged —
    Pydantic's "json mode" converts dates and the like to JSON-friendly
    types, but a NaN float stays a NaN float. `json.dumps` then writes it as
    the bare token `NaN`/`Infinity`, which every spec-compliant JSON.parse
    (i.e. every browser) rejects — one bad value anywhere in one ticker's
    page took the whole static build down (see quotes.price_series' own
    NaN-close fix, the specific case this caught). Sanitizing here is the
    backstop for whichever source produces the next one.
    """
    if isinstance(value, float):
        return None if math.isnan(value) or math.isinf(value) else value
    if isinstance(value, dict):
        return {k: _sanitize_nan(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize_nan(v) for v in value]
    return value


def _write(path: Path, model: BaseModel) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    # mode="json" so dates/datetimes serialize to ISO strings rather than
    # Python objects json.dump can't handle.
    data = _sanitize_nan(model.model_dump(mode="json"))
    payload = json.dumps(data, separators=(",", ":"))
    path.write_text(payload, encoding="utf-8")
    return len(payload)


def dump(out_dir: Path, *, with_prices: bool = True) -> dict[str, int]:
    """Write every JSON file the frontend needs. Returns {relative_path: bytes}."""
    written: dict[str, int] = {}

    with session_scope() as session:
        index = _index(session)
        written["index.json"] = _write(out_dir / "index.json", index)

        for days in CALENDAR_WINDOWS:
            name = f"calendar-{days}.json"
            written[name] = _write(out_dir / name, _calendar(session, days=days))

        written["calendar.json"] = _write(
            out_dir / "calendar.json", _calendar(session, days=DEFAULT_WINDOW_DAYS)
        )

        written["calendar-full.json"] = _write(
            out_dir / "calendar-full.json", _calendar_full(session)
        )

        written["past-earnings.json"] = _write(
            out_dir / "past-earnings.json", _past_earnings(session)
        )

        written["signals.json"] = _write(out_dir / "signals.json", _signals(session))
        written["dashboard-news.json"] = _write(
            out_dir / "dashboard-news.json", _dashboard_news(session)
        )
        written["track-record.json"] = _write(
            out_dir / "track-record.json",
            pages.track_record_page(repo.track_record(session)),
        )

        for entry in index.tickers:
            ticker = entry.ticker
            series = quotes.price_series(ticker) if with_prices else []
            page = pages.ticker_page(session, ticker, prices=series)
            # News costs nothing to fetch fresh (unlike options), so a
            # missing snapshot — or a snapshot whose own news fetch
            # specifically failed that night — shouldn't ship a permanently
            # empty panel to a static site that won't regenerate until
            # tomorrow night.
            if page.news is None:
                page.news = quotes.live_news(ticker)
            name = f"ticker/{ticker}.json"
            written[name] = _write(out_dir / "ticker" / f"{ticker}.json", page)
            log.info("%s: %d bytes (%d price points)", ticker, written[name], len(series))

    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        default="../web/public/data",
        help="output directory (default: the Next.js public/data folder)",
    )
    parser.add_argument(
        "--no-prices",
        action="store_true",
        help="skip the yfinance price series — much faster, for schema checks",
    )
    args = parser.parse_args()

    out_dir = Path(args.out).resolve()
    written = dump(out_dir, with_prices=not args.no_prices)

    total = sum(written.values())
    log.info("Wrote %d files, %.1f KB total, to %s", len(written), total / 1024, out_dir)


if __name__ == "__main__":
    main()
