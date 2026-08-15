"""Daily price series for the ticker page chart.

The one read path that leaves Postgres. yfinance is free and unmetered, so
unlike the options data this doesn't need pre-computing — but it is slow
(~1s/ticker) and flaky, so the static generator bakes it in and the dev server
memoises it per process.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import date, timedelta

from earnings.data import prices

from app.schemas import PricePoint

log = logging.getLogger("quotes")

# A year of daily closes: enough to show four earnings prints in context
# without the chart turning into a smear.
DEFAULT_DAYS = 365

_cache: dict[tuple[str, int], list[PricePoint]] = {}


def price_series(ticker: str, *, days: int = DEFAULT_DAYS) -> list[PricePoint]:
    """Daily closes, oldest first. Empty on any failure — the chart is one
    panel on a page, never a reason to fail the whole request."""
    key = (ticker, days)
    if key in _cache:
        return _cache[key]

    try:
        closes = prices.daily_closes(ticker)
    except Exception as exc:
        log.warning("price_series (%s): %s", ticker, exc)
        return []

    if closes is None or closes.empty:
        return []

    cutoff = date.today() - timedelta(days=days)
    series = [
        PricePoint(date=idx.date(), close=round(float(value), 4))
        for idx, value in closes.items()
        if idx.date() >= cutoff
    ]

    _cache[key] = series
    return series


def latest_closes(tickers: Iterable[str]) -> dict[str, float]:
    """Most recent daily close per ticker — the free fallback for a ticker
    with no dashboard snapshot (aged out of the tracked universe, or never
    in it). Skips tickers whose series comes back empty rather than writing
    a None in; callers already treat "no entry" as "no fallback available".
    """
    result: dict[str, float] = {}
    for ticker in tickers:
        series = price_series(ticker)
        if series:
            result[ticker] = series[-1].close
    return result


def clear_cache() -> None:
    """Used by tests, and by the static generator between runs."""
    _cache.clear()
