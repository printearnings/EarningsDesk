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

from earnings.data import fundamentals as fundamentals_data
from earnings.data import news as news_data
from earnings.data import prices

from app.schemas import AnalystRatingRow, Fundamentals, NewsItem, PricePoint

log = logging.getLogger("quotes")

# A year of daily closes: enough to show four earnings prints in context
# without the chart turning into a smear.
DEFAULT_DAYS = 365

# Enough analyst actions to show a real timeline without the table becoming
# the page. Matches the ratings history most readers scan — the last few
# quarters of coverage changes, not a multi-year archive.
ANALYST_RATINGS_LIMIT = 25

_cache: dict[tuple[str, int], list[PricePoint]] = {}
_fundamentals_cache: dict[str, Fundamentals | None] = {}
_ratings_cache: dict[str, list[AnalystRatingRow]] = {}


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
            open=None if math.isnan(row.Open) else round(float(row.Open), 4),
            high=None if math.isnan(row.High) else round(float(row.High), 4),
            low=None if math.isnan(row.Low) else round(float(row.Low), 4),
            volume=None if math.isnan(row.Volume) else round(float(row.Volume)),
        )
        for idx, row in bars.iterrows()
        # `close` is the one required field on PricePoint (see schemas.py) —
        # yfinance occasionally hands back a row with a NaN close (a data
        # gap, not a real $0 or missing-but-known price). A NaN there isn't
        # valid JSON once serialized (Python's json module writes it as the
        # bare token `NaN`, which every spec-compliant JSON.parse rejects),
        # so a single bad row silently broke the static build for every
        # ticker whose latest bar happened to land on one. Drop the row
        # entirely rather than pretend it has a close — there's nothing
        # meaningful to plot for a day with no real trade data anyway.
        if idx.date() >= cutoff and not math.isnan(row.Close)
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


def company_fundamentals(ticker: str) -> Fundamentals | None:
    """The valuation/profitability/ownership ratio grid.

    None when the lookup failed or the symbol is unknown — distinct from a
    Fundamentals whose individual fields are None, which means "we asked,
    and this company genuinely has no P/E". Same free-yfinance,
    memoise-per-process shape as `price_series`.
    """
    if ticker in _fundamentals_cache:
        return _fundamentals_cache[ticker]

    try:
        raw = fundamentals_data.fundamentals(ticker)
    except Exception as exc:
        log.warning("company_fundamentals (%s): %s", ticker, exc)
        raw = None

    result = Fundamentals(**raw.as_dict()) if raw else None
    _fundamentals_cache[ticker] = result
    return result


def analyst_ratings(ticker: str, *, limit: int = ANALYST_RATINGS_LIMIT) -> list[AnalystRatingRow]:
    """Recent analyst upgrades/downgrades, newest first. Empty on any
    failure or for a symbol with no coverage — one panel on a page is never
    a reason to fail the whole request."""
    if ticker in _ratings_cache:
        return _ratings_cache[ticker]

    try:
        rows = fundamentals_data.analyst_ratings_history(ticker, limit=limit)
    except Exception as exc:
        log.warning("analyst_ratings (%s): %s", ticker, exc)
        rows = []

    result = [AnalystRatingRow(**r.as_dict()) for r in rows]
    _ratings_cache[ticker] = result
    return result


def clear_cache() -> None:
    """Used by tests, and by the static generator between runs."""
    _cache.clear()
