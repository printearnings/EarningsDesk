"""HTTP routes for local development.

In production the frontend reads static JSON from Cloudflare Pages, generated
by `app.dump_json` from the same functions these handlers call. This module
exists so `next dev` has something to talk to, and so the response shapes get
exercised by tests.
"""

from __future__ import annotations

from datetime import date, timedelta

from earnings.core.clock import market_today
from earnings.store import repo
from earnings.store.models import DashboardSnapshot
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.deps import get_session, require_db
from app.schemas import (
    CalendarPage,
    DashboardNewsPage,
    HowWeScorePage,
    PastEarningsPage,
    SignalsPage,
    SiteIndex,
    TickerIndexEntry,
    TickerPage,
    TrackRecordPage,
)
from app.services import pages, quotes

router = APIRouter(dependencies=[Depends(require_db)])

DEFAULT_WINDOW_DAYS = 14
MAX_WINDOW_DAYS = 90
SIGNAL_FEED_LIMIT = 500
PAST_EARNINGS_LIMIT = 300

# The month-grid calendar navigates client-side over one payload rather than
# fetching per month — the tracked universe is small enough (tens of events)
# that shipping ~1.5 years up front is cheaper than a request per navigation.
FULL_CALENDAR_PAST_DAYS = 180
FULL_CALENDAR_FUTURE_DAYS = 365


@router.get("/calendar", response_model=CalendarPage, tags=["calendar"])
def get_calendar(
    days: int = Query(DEFAULT_WINDOW_DAYS, ge=1, le=MAX_WINDOW_DAYS),
    session: Session = Depends(get_session),
) -> CalendarPage:
    return _calendar(session, days=days)


def _calendar(session: Session, *, days: int, as_of: date | None = None) -> CalendarPage:
    as_of = as_of or market_today()
    events = repo.upcoming_events(session, start_date=as_of, days=days, limit=500)
    snapshots = {s.ticker: s for s in repo.latest_dashboard_snapshots(session)}
    return pages.calendar_page(events, snapshots, as_of=as_of, window_days=days)


@router.get("/ticker/{ticker}", response_model=TickerPage, tags=["ticker"])
def get_ticker(
    ticker: str,
    with_prices: bool = Query(True, description="fetch the price chart series"),
    session: Session = Depends(get_session),
) -> TickerPage:
    ticker = ticker.strip().upper()
    if not ticker.isalpha() or len(ticker) > 6:
        raise HTTPException(status_code=400, detail=f"Not a ticker symbol: {ticker!r}")

    series = quotes.price_series(ticker) if with_prices else []
    page = pages.ticker_page(
        session,
        ticker,
        prices=series,
        fundamentals=quotes.company_fundamentals(ticker),
        analyst_ratings=quotes.analyst_ratings(ticker),
    )

    # A ticker with no snapshot, no history and no price data doesn't exist as
    # far as we're concerned. One with prices but nothing else is a valid cold
    # lookup and renders with empty states.
    if not page.is_tracked and not page.prices:
        raise HTTPException(status_code=404, detail=f"No data for {ticker}")

    # News costs nothing to fetch fresh (unlike options), so a missing
    # snapshot — or a snapshot whose own news fetch specifically failed that
    # night — shouldn't leave the panel permanently empty.
    if page.news is None:
        page.news = quotes.live_news(ticker)

    return page


@router.get("/calendar/full", response_model=CalendarPage, tags=["calendar"])
def get_calendar_full(session: Session = Depends(get_session)) -> CalendarPage:
    return _calendar_full(session)


def _calendar_full(session: Session) -> CalendarPage:
    """Everything from FULL_CALENDAR_PAST_DAYS ago through FULL_CALENDAR_FUTURE_DAYS
    out, as one payload, for the month-grid calendar to page through client-side.

    `as_of` (for CalendarEntry.days_until) stays anchored to *today*, not the
    query's start date — a past event should read "12 days ago", not "-192
    days ago" measured from the window's edge.
    """
    today = market_today()
    start = today - timedelta(days=FULL_CALENDAR_PAST_DAYS)
    total_days = FULL_CALENDAR_PAST_DAYS + FULL_CALENDAR_FUTURE_DAYS
    events = repo.upcoming_events(session, start_date=start, days=total_days, limit=2000)
    snapshots = {s.ticker: s for s in repo.latest_dashboard_snapshots(session)}
    return pages.calendar_page(events, snapshots, as_of=today, window_days=total_days)


@router.get("/past-earnings", response_model=PastEarningsPage, tags=["past-earnings"])
def get_past_earnings(session: Session = Depends(get_session)) -> PastEarningsPage:
    return _past_earnings(session)


def _missing_spot_tickers(tickers: set[str], snapshots: dict[str, DashboardSnapshot]) -> set[str]:
    """Only fetch a fallback close for tickers the snapshot table can't
    already answer — most rows are for currently- or recently-tracked
    tickers, so this keeps the free-but-slow yfinance fallback rare rather
    than paid for every row on every request."""
    return {t for t in tickers if not (snapshots.get(t) and snapshots[t].spot is not None)}


def _past_earnings(session: Session, *, before: date | None = None) -> PastEarningsPage:
    before = before or market_today()
    rows = repo.past_earnings(session, before=before, limit=PAST_EARNINGS_LIMIT)
    snapshots = {s.ticker: s for s in repo.latest_dashboard_snapshots(session)}
    missing = _missing_spot_tickers({r.ticker for r in rows}, snapshots)
    latest_close = quotes.latest_closes(missing)
    return pages.past_earnings_page(rows, snapshots, latest_close)


@router.get("/signals", response_model=SignalsPage, tags=["signals"])
def get_signals(session: Session = Depends(get_session)) -> SignalsPage:
    return _signals(session)


def _signals(session: Session) -> SignalsPage:
    rows = repo.recent_signals(session, limit=SIGNAL_FEED_LIMIT)
    snapshots = {s.ticker: s for s in repo.latest_dashboard_snapshots(session)}
    missing = _missing_spot_tickers({r.ticker for r in rows}, snapshots)
    latest_close = quotes.latest_closes(missing)
    return pages.signals_page(rows, snapshots, latest_close)


@router.get("/track-record", response_model=TrackRecordPage, tags=["track-record"])
def get_track_record(session: Session = Depends(get_session)) -> TrackRecordPage:
    return pages.track_record_page(repo.track_record(session))


@router.get("/how-we-score", response_model=HowWeScorePage, tags=["track-record"])
def get_how_we_score(session: Session = Depends(get_session)) -> HowWeScorePage:
    """The most recent clean, priced trade of each kind, for the worked
    examples on "How calls are tested"."""
    return pages.how_we_score_page(repo.scored_examples(session))


@router.get("/dashboard-news", response_model=DashboardNewsPage, tags=["dashboard"])
def get_dashboard_news(session: Session = Depends(get_session)) -> DashboardNewsPage:
    return _dashboard_news(session)


def _dashboard_news(session: Session) -> DashboardNewsPage:
    return pages.dashboard_news(repo.latest_dashboard_snapshots(session))


@router.get("/index", response_model=SiteIndex, tags=["meta"])
def get_index(session: Session = Depends(get_session)) -> SiteIndex:
    return _index(session)


def _index(session: Session) -> SiteIndex:
    """Drives both client-side search and the static export's route list."""
    from datetime import UTC, datetime

    snapshots = {s.ticker: s for s in repo.latest_dashboard_snapshots(session)}
    entries = [
        TickerIndexEntry(
            ticker=t,
            company_name=snapshots[t].company_name if t in snapshots else None,
            company_domain=snapshots[t].company_domain if t in snapshots else None,
            next_report_date=snapshots[t].next_report_date if t in snapshots else None,
            next_report_session=snapshots[t].next_report_session if t in snapshots else None,
            verdict=snapshots[t].verdict if t in snapshots else None,
            spot=snapshots[t].spot if t in snapshots else None,
            implied_move=snapshots[t].implied_move if t in snapshots else None,
        )
        for t in repo.known_tickers(session)
    ]
    return SiteIndex(generated_at=datetime.now(UTC), tickers=entries)
