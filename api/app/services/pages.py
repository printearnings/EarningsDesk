"""Map engine objects onto the wire schemas.

Everything here is a pure function of already-fetched data plus a `now`, with
one exception (`ticker_page`, which takes a Session to read Postgres). No
network calls live in this module — that keeps the mapping testable against
fabricated rows and makes it obvious that rendering a page costs nothing.

The read path deliberately never touches Massive or RapidAPI. That's the whole
point of dashboard_snapshots: a visitor is served from Postgres, and metered
data is only refetched by the nightly cron or by an explicit user click.
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime

from earnings.core.llm_context import TickerContext
from earnings.store import repo
from earnings.store.models import DashboardSnapshot
from earnings.store.repo import PastEarningsRow as EnginePastEarningsRow
from earnings.store.repo import SignalFeedRow, TimelineEvent, TrackRecord, UpcomingEvent
from sqlalchemy.orm import Session

from app.config import api_settings
from app.schemas import (
    AiSummary,
    CalendarEntry,
    CalendarPage,
    EarningsHistoryRow,
    HistoryStats,
    NewsItem,
    OptionsPanel,
    PastEarningsPage,
    PastEarningsRow,
    PricePoint,
    SignalRow,
    SignalsPage,
    TickerPage,
    TrackRecordPage,
)

# Two years of quarterly prints. The dashboard's stated history window.
HISTORY_LIMIT = 8


def _richness(implied: float | None, hist: float | None) -> float | None:
    """implied / historical - 1, guarding the degenerate case.

    A zero or missing historical average means we have no baseline, so there is
    no richness to report — returning 0.0 there would read as "fairly priced",
    which is a claim we can't support.
    """
    if implied is None or not hist:
        return None
    return implied / hist - 1.0


def options_panel(snap: DashboardSnapshot) -> OptionsPanel | None:
    """None when the snapshot carries no options data at all.

    Distinct from a panel of Nones: indices, thin names and recent IPOs have no
    listed weekly options, and the UI should omit the panel rather than render
    an empty one.
    """
    if snap.implied_move is None and snap.put_call_ratio is None:
        return None

    return OptionsPanel(
        implied_move=snap.implied_move,
        hist_avg_move=snap.hist_avg_move,
        richness=_richness(snap.implied_move, snap.hist_avg_move),
        verdict=snap.verdict,
        edge_score=snap.edge_score,
        put_call_ratio=snap.put_call_ratio,
        atm_open_interest=snap.atm_open_interest,
        atm_strike=snap.atm_strike,
        atm_expiry=snap.atm_expiry,
        iv_front=snap.iv_front,
        iv_back=snap.iv_back,
        iv_inverted=None if snap.iv_inverted is None else bool(snap.iv_inverted),
    )


def history_rows(timeline: list[TimelineEvent], *, limit: int = HISTORY_LIMIT) -> list[
    EarningsHistoryRow
]:
    """Newest-first history, deduped to one row per report date.

    `ticker_timeline` LEFT JOINs signals, so an event carrying both a
    Workflow-A and a Workflow-B signal comes back as two rows. The dashboard
    shows one row per quarter, so merge them: take the vol fields from
    whichever row has them and the directional fields from whichever row has
    those.
    """
    merged: dict[date, EarningsHistoryRow] = {}

    for e in timeline:
        row = merged.get(e.report_date)
        if row is None:
            merged[e.report_date] = EarningsHistoryRow(
                report_date=e.report_date,
                session=e.session,
                eps_estimate=e.eps_estimate,
                eps_actual=e.eps_actual,
                eps_surprise=e.eps_surprise,
                implied_move=e.implied_move,
                realized_move=e.realized_move,
                beat_implied=e.beat_implied,
                verdict=e.verdict,
                direction=e.direction,
                correct_direction=e.correct_direction,
                pnl=e.pnl,
                gap_open_pct=e.gap_open_pct,
                gap_filled=e.gap_filled,
                vol_ratio=e.vol_ratio,
            )
            continue

        # Fill only the holes — never overwrite a value we already have.
        for field in (
            "session",
            "eps_estimate",
            "eps_actual",
            "eps_surprise",
            "implied_move",
            "realized_move",
            "beat_implied",
            "verdict",
            "direction",
            "correct_direction",
            "pnl",
            "gap_open_pct",
            "gap_filled",
            "vol_ratio",
        ):
            if getattr(row, field) is None:
                setattr(row, field, getattr(e, field))

    ordered = sorted(merged.values(), key=lambda r: r.report_date, reverse=True)
    return ordered[:limit]


def past_earnings_page(rows: list[EnginePastEarningsRow]) -> PastEarningsPage:
    """Cross-ticker history feed, deduped to one row per (ticker, report_date).

    Same merge shape as history_rows: repo.past_earnings does a plain LEFT
    JOIN, so a ticker with both a Workflow-A and Workflow-B signal for one
    event arrives as two rows. First value seen for each field wins; a later
    duplicate only fills genuine holes, never overwrites a known value.
    """
    merged: dict[tuple[str, date], PastEarningsRow] = {}

    for r in rows:
        key = (r.ticker, r.report_date)
        existing = merged.get(key)
        if existing is None:
            merged[key] = PastEarningsRow(
                ticker=r.ticker,
                report_date=r.report_date,
                session=r.session,
                eps_estimate=r.eps_estimate,
                eps_actual=r.eps_actual,
                eps_surprise=r.eps_surprise,
                implied_move=r.implied_move,
                verdict=r.verdict,
                direction=r.direction,
                realized_move=r.realized_move,
                beat_implied=r.beat_implied,
                gap_open_pct=r.gap_open_pct,
                gap_filled=r.gap_filled,
                vol_ratio=r.vol_ratio,
                pnl=r.pnl,
            )
            continue

        for field in (
            "session",
            "eps_estimate",
            "eps_actual",
            "eps_surprise",
            "implied_move",
            "verdict",
            "direction",
            "realized_move",
            "beat_implied",
            "gap_open_pct",
            "gap_filled",
            "vol_ratio",
            "pnl",
        ):
            if getattr(existing, field) is None:
                setattr(existing, field, getattr(r, field))

    # repo.past_earnings already orders newest-first; dict insertion order
    # preserves that, so no re-sort is needed after the merge.
    return PastEarningsPage(rows=list(merged.values()))


def history_stats(ctx: TickerContext | None) -> HistoryStats | None:
    if ctx is None:
        return None
    return HistoryStats(
        n_events=ctx.n_events,
        hit_rate=ctx.hit_rate,
        avg_pnl=ctx.avg_pnl,
        avg_implied_move=ctx.avg_implied_move,
        avg_realized_move=ctx.avg_realized_move,
        overpricing_bias=ctx.overpricing_bias,
        avg_gap_open_pct=ctx.avg_gap_open_pct,
        gap_fill_rate=ctx.gap_fill_rate,
        avg_vol_ratio=ctx.avg_vol_ratio,
    )


def _ai_summary(snap: DashboardSnapshot) -> AiSummary | None:
    """Parse the stored JSON, tolerating a malformed blob.

    A summary that fails to parse must not take the page down with it — the
    numbers are the point, the prose is commentary.
    """
    if not snap.ai_summary:
        return None
    try:
        payload = json.loads(snap.ai_summary)
    except (json.JSONDecodeError, TypeError):
        return None
    payload.setdefault("model", snap.ai_summary_model)
    try:
        return AiSummary(**payload)
    except Exception:
        return None


def _news(snap: DashboardSnapshot) -> list[NewsItem] | None:
    """Parse stored news, tolerating both shapes.

    Rows written before links were added hold a plain list of strings; newer
    rows hold objects. Both live in the table at once — snapshots are retained
    90 days — so this reads either rather than requiring a backfill.
    """
    if snap.news_json is None:
        return None  # fetch failed — distinct from "no news"

    try:
        raw = json.loads(snap.news_json)
    except (json.JSONDecodeError, TypeError):
        return None

    if not isinstance(raw, list):
        return None

    items: list[NewsItem] = []
    for entry in raw:
        if isinstance(entry, str):
            items.append(NewsItem(title=entry))
        elif isinstance(entry, dict) and entry.get("title"):
            items.append(
                NewsItem(
                    title=entry["title"],
                    url=entry.get("url"),
                    publisher=entry.get("publisher"),
                    published_at=entry.get("published_at"),
                    thumbnail_url=entry.get("thumbnail_url"),
                )
            )
    return items


def ticker_page(
    session: Session,
    ticker: str,
    *,
    prices: list[PricePoint] | None = None,
    now: datetime | None = None,
) -> TickerPage:
    """Assemble one ticker's page from Postgres alone.

    `prices` is injected rather than fetched here because it's the one part
    that needs a network call (yfinance). The static generator passes it in;
    the dev server fetches it in the router. Keeping it out means this function
    stays pure enough to test with an in-memory SQLite database.
    """
    ticker = ticker.strip().upper()
    now = now or datetime.now(UTC)

    snap = repo.latest_dashboard_snapshot(session, ticker)
    timeline = repo.ticker_timeline(session, ticker, limit=HISTORY_LIMIT * 3)
    records = repo.ticker_earnings_history(session, ticker, limit=HISTORY_LIMIT)

    from earnings.core.llm_context import build as build_ctx

    stats = history_stats(build_ctx(ticker, records)) if records else None

    page = TickerPage(
        ticker=ticker,
        # "Tracked" means the nightly cron covers it. A ticker with timeline
        # rows but no snapshot was tracked historically; treat it as tracked so
        # its history still renders with full context.
        is_tracked=bool(snap or timeline),
        history=history_rows(timeline),
        stats=stats,
        prices=prices or [],
    )

    if snap is None:
        return page

    age_hours = (now - _aware(snap.as_of)).total_seconds() / 3600 if snap.as_of else None

    page.as_of = snap.as_of
    page.snapshot_age_hours = round(age_hours, 1) if age_hours is not None else None
    page.is_stale = bool(
        age_hours is not None and age_hours > api_settings.snapshot_stale_after_hours
    )
    page.company_name = snap.company_name
    page.company_domain = snap.company_domain
    page.spot = snap.spot
    page.next_report_date = snap.next_report_date
    page.next_report_session = snap.next_report_session
    page.days_until_report = (
        (snap.next_report_date - now.date()).days if snap.next_report_date else None
    )
    page.options = options_panel(snap)
    page.news = _news(snap)
    page.news_sentiment = snap.news_sentiment
    page.analyst_score = snap.analyst_score
    page.analyst_rating_raw = snap.analyst_rating_raw
    page.ai_summary = _ai_summary(snap)

    return page


def _aware(dt: datetime) -> datetime:
    """SQLite drops tzinfo on round-trip; Postgres keeps it. Normalise so the
    age subtraction doesn't raise on one backend and work on the other."""
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def calendar_page(
    events: list[UpcomingEvent],
    snapshots: dict[str, DashboardSnapshot],
    *,
    as_of: date,
    window_days: int,
) -> CalendarPage:
    """Upcoming events enriched with each ticker's latest snapshot numbers.

    `repo.upcoming_events` LEFT JOINs Signal, so an event carrying both a
    Workflow-A (verdict) and Workflow-B (direction) signal arrives as two
    rows for the same (ticker, report_date) — merge them into one entry, same
    as history_rows/past_earnings_page do for the single- and cross-ticker
    history tables. Without this a dual-signal day renders the same ticker
    chip twice.
    """
    merged: dict[tuple[str, date], CalendarEntry] = {}

    for e in events:
        snap = snapshots.get(e.ticker)
        key = (e.ticker, e.report_date)
        existing = merged.get(key)

        if existing is None:
            merged[key] = CalendarEntry(
                ticker=e.ticker,
                report_date=e.report_date,
                # Prefer the event row's own session; fall back to the snapshot.
                session=e.session or (snap.next_report_session if snap else None),
                days_until=(e.report_date - as_of).days,
                verdict=e.verdict or (snap.verdict if snap else None),
                direction=e.direction,
                implied_move=snap.implied_move if snap else None,
                hist_avg_move=snap.hist_avg_move if snap else None,
                edge_score=snap.edge_score if snap else None,
            )
            continue

        if existing.verdict is None and e.verdict is not None:
            existing.verdict = e.verdict
        if existing.direction is None and e.direction is not None:
            existing.direction = e.direction
        if existing.session is None and e.session is not None:
            existing.session = e.session

    return CalendarPage(as_of=as_of, window_days=window_days, entries=list(merged.values()))


def signals_page(rows: list[SignalFeedRow]) -> SignalsPage:
    return SignalsPage(
        rows=[
            SignalRow(
                ticker=r.ticker,
                run_date=r.run_date,
                report_date=r.report_date,
                workflow=r.workflow,
                verdict=r.verdict,
                direction=r.direction,
                implied_move=r.implied_move,
                edge_score=r.edge_score,
                confidence=r.confidence,
            )
            for r in rows
        ]
    )


def track_record_page(record: TrackRecord) -> TrackRecordPage:
    return TrackRecordPage(
        scored=record.scored,
        directional=record.directional,
        correct=record.correct,
        accuracy=record.accuracy,
        avg_long_straddle_pnl=record.avg_long_straddle_pnl,
        dir_scored=record.dir_scored,
        dir_correct=record.dir_correct,
        dir_accuracy=record.dir_accuracy,
    )
