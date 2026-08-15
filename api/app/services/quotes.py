"""Daily prices and news for the ticker page — the two things free/unmetered
yfinance can answer without a dashboard_snapshot to read from.

The one read path that leaves Postgres. yfinance is free and unmetered, so
unlike the options data this doesn't need pre-computing — but it is slow
(~1s/ticker) and flaky, so the static generator bakes it in and the dev server
memoises it per process.
"""

from __future__ import annotations

import logging
import math
from collections.abc import Iterable
from datetime import date, timedelta

from earnings.data import news as news_data
from earnings.data import prices

from app.schemas import NewsItem, PricePoint

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
        bars = prices.daily_ohlcv(ticker)
    except Exception as exc:
        log.warning("price_series (%s): %s", ticker, exc)
        return []

    if bars is None or bars.empty:
        return []

    cutoff = date.today() - timedelta(days=days)
    series = [
        PricePoint(
            date=idx.date(),
            close=round(float(row.Close), 4),
            open=round(float(row.Open), 4),
            high=round(float(row.High), 4),
            low=round(float(row.Low), 4),
            volume=None if math.isnan(row.Volume) else round(float(row.Volume)),
        )
        for idx, row in bars.iterrows()
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


def live_news(ticker: str, *, limit: int = 12) -> list[NewsItem] | None:
    """Live headlines, for a ticker page whose `news` came back None —
    whether because there's no snapshot at all (untracked, or tracked but
    never yet captured by the nightly job) or because the snapshot exists
    but that night's news fetch specifically failed. Either way, news itself
    costs nothing to fetch fresh (unlike options), so there's no reason a
    reader should see a permanently empty panel over it.

    None on failure — same "couldn't load" contract as the snapshot-parsed
    path (`app.services.pages._news`), so the frontend's existing null
    handling doesn't need to know which path produced the answer.
    """
    try:
        stories = news_data.stories_or_raise(ticker, limit=limit)
    except news_data.NewsFetchError as exc:
        log.warning("live_news (%s): %s", ticker, exc)
        return None
    return [NewsItem(**s.as_dict()) for s in stories]


def clear_cache() -> None:
    """Used by tests, and by the static generator between runs."""
    _cache.clear()
