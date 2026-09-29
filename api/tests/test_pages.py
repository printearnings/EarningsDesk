"""Tests for the engine -> wire-schema mapping.

Runs against in-memory SQLite with fabricated rows: no network, no Neon. The
most important assertion in this file is `test_read_path_makes_no_metered_calls`
— the entire hosting model depends on a page view being free.
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta

import pytest
from earnings.store import repo
from earnings.store.models import Base
from earnings.store.repo import TimelineEvent, TrackRecord
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.schemas import StrikeOpenInterest
from app.services import pages

NOW = datetime(2026, 8, 8, 12, 0, tzinfo=UTC)


@pytest.fixture
def s():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def _tl(report_date: date, **kw) -> TimelineEvent:
    base = dict(
        session=None,
        eps_estimate=None,
        eps_actual=None,
        eps_surprise=None,
        implied_move=None,
        hist_avg_move=None,
        verdict=None,
        direction=None,
        realized_move=None,
        beat_implied=None,
        correct_direction=None,
        pnl=None,
    )
    return TimelineEvent(report_date=report_date, **{**base, **kw})


def _snap(s, ticker="NVDA", **kw):
    base = dict(as_of=NOW, spot=223.76, next_report_date=date(2026, 8, 26))
    return repo.upsert_dashboard_snapshot(s, ticker, date(2026, 8, 8), **{**base, **kw})


# ---- richness --------------------------------------------------------------


def test_richness_is_implied_over_historical():
    assert pages._richness(0.08, 0.06) == pytest.approx(0.3333, abs=1e-3)


@pytest.mark.parametrize("hist", [None, 0, 0.0])
def test_richness_without_a_baseline_is_none(hist):
    """0.0 would render as "fairly priced" — a claim we can't support with no
    historical average to compare against."""
    assert pages._richness(0.08, hist) is None


def test_richness_needs_an_implied_move():
    assert pages._richness(None, 0.06) is None


# ---- options panel ---------------------------------------------------------


def test_options_panel_maps_and_derives(s):
    snap = _snap(
        s,
        implied_move=0.08,
        hist_avg_move=0.06,
        verdict="RICH",
        edge_score=10.0,
        put_call_ratio=0.57,
        atm_open_interest=11621,
        iv_front=0.4264,
        iv_back=0.4143,
        iv_inverted=1,
        call_volume=9000,
        put_volume=5130,
        atm_volume=3400,
        oi_by_strike_json=json.dumps(
            [
                {"strike": 220.0, "call_oi": 4000, "put_oi": 3500},
                {"strike": 225.0, "call_oi": 6000, "put_oi": 5200},
            ]
        ),
    )
    panel = pages.options_panel(snap)

    assert panel.verdict == "RICH"
    assert panel.richness == pytest.approx(0.3333, abs=1e-3)
    assert panel.iv_inverted is True
    assert panel.put_call_ratio == 0.57
    assert panel.call_volume == 9000
    assert panel.put_volume == 5130
    assert panel.atm_volume == 3400
    assert panel.oi_by_strike == [
        StrikeOpenInterest(strike=220.0, call_oi=4000, put_oi=3500),
        StrikeOpenInterest(strike=225.0, call_oi=6000, put_oi=5200),
    ]


def test_options_panel_oi_by_strike_is_none_without_a_stored_series(s):
    panel = pages.options_panel(_snap(s, put_call_ratio=0.57))
    assert panel.oi_by_strike is None


def test_options_panel_absent_when_there_is_no_chain(s):
    """Indices and thin names have no listed options. Omit the panel rather
    than rendering one full of blanks."""
    assert pages.options_panel(_snap(s)) is None


def test_options_panel_survives_a_partial_chain(s):
    """A chain with no historical baseline yields flow data but no verdict."""
    panel = pages.options_panel(_snap(s, put_call_ratio=0.57, implied_move=None))
    assert panel is not None
    assert panel.put_call_ratio == 0.57
    assert panel.verdict is None


def test_iv_inverted_zero_is_false_not_none(s):
    panel = pages.options_panel(_snap(s, implied_move=0.08, iv_inverted=0))
    assert panel.iv_inverted is False


# ---- history rows ----------------------------------------------------------


def test_history_merges_the_two_signals_for_one_event():
    """ticker_timeline LEFT JOINs signals, so an event with both a Workflow-A
    and a Workflow-B signal arrives as two rows. The table shows one row per
    quarter."""
    rows = pages.history_rows(
        [
            _tl(date(2026, 5, 20), verdict="RICH", implied_move=0.08),
            _tl(date(2026, 5, 20), direction="BULLISH", correct_direction=True),
        ]
    )

    assert len(rows) == 1
    assert rows[0].verdict == "RICH"
    assert rows[0].direction == "BULLISH"
    assert rows[0].correct_direction is True


def test_history_merge_does_not_overwrite_a_known_value():
    rows = pages.history_rows(
        [
            _tl(date(2026, 5, 20), verdict="RICH"),
            _tl(date(2026, 5, 20), verdict="CHEAP"),
        ]
    )
    assert rows[0].verdict == "RICH"  # first wins, not last


def test_history_is_newest_first_and_capped():
    rows = pages.history_rows([_tl(date(2024, m, 1)) for m in range(1, 13)])
    assert len(rows) == pages.HISTORY_LIMIT
    assert rows[0].report_date > rows[-1].report_date


def test_history_carries_eps_fields():
    rows = pages.history_rows(
        [
            _tl(
                date(2026, 5, 20),
                session="AMC",
                eps_estimate=1.77,
                eps_actual=1.87,
                eps_surprise=5.54,
            )
        ]
    )
    assert (rows[0].session, rows[0].eps_surprise) == ("AMC", 5.54)


# ---- news / summary parsing ------------------------------------------------


def test_failed_news_fetch_is_null_not_empty(s):
    """The UI needs to distinguish "couldn't load" from "nothing happening"."""
    assert pages._news(_snap(s, news_json=None)) is None
    assert pages._news(_snap(s, news_json=json.dumps([]))) == []


def test_malformed_news_json_degrades_to_none(s):
    assert pages._news(_snap(s, news_json="{not json")) is None


# ---- dashboard news feed -----------------------------------------------------


def _story(title: str, **kw) -> dict:
    return {"title": title, "url": None, "publisher": None, "published_at": None, **kw}


def test_dashboard_news_merges_and_sorts_across_tickers(s):
    nvda = _snap(
        s,
        ticker="NVDA",
        company_name="NVIDIA",
        news_json=json.dumps([_story("NVDA older", published_at="2026-08-01T00:00:00Z")]),
    )
    amd = _snap(
        s,
        ticker="AMD",
        company_name="AMD",
        news_json=json.dumps([_story("AMD newer", published_at="2026-08-05T00:00:00Z")]),
    )
    page = pages.dashboard_news([nvda, amd])
    assert [i.title for i in page.items] == ["AMD newer", "NVDA older"]
    assert page.items[0].ticker == "AMD"
    assert page.items[0].company_name == "AMD"


def test_dashboard_news_skips_snapshots_with_no_news(s):
    ok = _snap(s, ticker="NVDA", news_json=json.dumps([_story("Has news")]))
    failed = _snap(s, ticker="AMD", news_json=None)
    empty = _snap(s, ticker="MU", news_json=json.dumps([]))
    page = pages.dashboard_news([ok, failed, empty])
    assert [i.title for i in page.items] == ["Has news"]


def test_dashboard_news_dedupes_a_story_shared_by_two_tickers(s):
    shared = _story("Chips for everyone", url="https://example.com/chips")
    a = _snap(s, ticker="NVDA", news_json=json.dumps([shared]))
    b = _snap(s, ticker="AMD", news_json=json.dumps([shared]))
    page = pages.dashboard_news([a, b])
    assert len(page.items) == 1


def test_dashboard_news_respects_the_limit(s):
    snaps = [
        _snap(s, ticker=f"T{i}", news_json=json.dumps([_story(f"story {i}")])) for i in range(5)
    ]
    page = pages.dashboard_news(snaps, limit=2)
    assert len(page.items) == 2


def test_ai_summary_parses_and_backfills_the_model(s):
    snap = _snap(
        s,
        ai_summary=json.dumps(
            {
                "headline": "Options price a 7.8% move.",
                "setup": "Rich versus a 3.5% historical average.",
                "history_read": "Beat estimates eight quarters running.",
                "watch_items": ["Data-center revenue"],
                "confidence": "medium",
            }
        ),
        ai_summary_model="claude-sonnet-5",
    )
    summary = pages._ai_summary(snap)
    assert summary.confidence == "medium"
    assert summary.model == "claude-sonnet-5"


def test_malformed_ai_summary_does_not_take_the_page_down(s):
    """The numbers are the point; the prose is commentary."""
    assert pages._ai_summary(_snap(s, ai_summary="{broken")) is None
    assert pages._ai_summary(_snap(s, ai_summary=json.dumps({"nope": 1}))) is None


# ---- ticker page -----------------------------------------------------------


def test_ticker_page_reports_snapshot_age(s):
    _snap(s, as_of=NOW - timedelta(hours=6))
    page = pages.ticker_page(s, "NVDA", now=NOW)

    assert page.snapshot_age_hours == pytest.approx(6.0, abs=0.1)
    assert page.is_stale is False


def test_a_passed_print_is_not_shown_as_upcoming(s):
    """PANW, Sep 2026: its snapshot froze before the Sep 1 print and the page
    kept showing that print's priced move and verdict as current."""
    _snap(
        s,
        as_of=NOW - timedelta(days=20),
        next_report_date=NOW.date() - timedelta(days=3),
        next_report_session="AMC",
        implied_move=0.08,
        hist_avg_move=0.06,
        verdict="RICH",
    )
    page = pages.ticker_page(s, "NVDA", now=NOW)
    assert page.next_report_date is None
    assert page.next_report_session is None
    assert page.days_until_report is None
    assert page.options is None
    assert page.is_stale is True


def test_stale_snapshot_is_flagged(s):
    """One missed nightly run is tolerated; two is not, and the reader must be
    told rather than shown old numbers as current."""
    _snap(s, as_of=NOW - timedelta(hours=48))
    assert pages.ticker_page(s, "NVDA", now=NOW).is_stale is True


def test_stale_threshold_widens_over_the_weekend(s):
    """build_dashboard only runs Tue-Sat — Friday's snapshot is still the
    freshest one available all through Saturday, Sunday, and Monday, so its
    growing age on those days isn't a missed run and shouldn't be flagged."""
    friday_close = datetime(2026, 8, 7, 21, 0, tzinfo=UTC)  # 2026-08-07 is a Friday

    sunday = datetime(2026, 8, 9, 12, 0, tzinfo=UTC)  # ~39h old — over the plain 36h cap
    _snap(s, as_of=friday_close)
    assert pages.ticker_page(s, "NVDA", now=sunday).is_stale is False

    monday = datetime(2026, 8, 10, 20, 0, tzinfo=UTC)  # ~71h old
    _snap(s, as_of=friday_close)
    assert pages.ticker_page(s, "NVDA", now=monday).is_stale is False


def test_stale_threshold_still_flags_a_genuinely_missed_weekend_run(s):
    """The weekend grace period is generous, not infinite — a snapshot that's
    stale even accounting for the market being closed must still be flagged."""
    ancient = datetime(2026, 7, 20, 12, 0, tzinfo=UTC)
    monday = datetime(2026, 8, 10, 20, 0, tzinfo=UTC)
    _snap(s, as_of=ancient)
    assert pages.ticker_page(s, "NVDA", now=monday).is_stale is True


def test_days_until_report(s):
    _snap(s, next_report_date=date(2026, 8, 26))
    assert pages.ticker_page(s, "NVDA", now=NOW).days_until_report == 18


def test_days_until_report_uses_market_timezone_not_utc(s):
    """02:00 UTC on the 19th is still 22:00 ET on the 18th — a report dated
    the 19th is tomorrow, not today. A bare `now.date()` on the UTC instant
    would read 0 days (today) here; that's the exact class of bug
    earnings.core.clock.market_today() exists to prevent, and ticker_page
    must apply the same fix."""
    late_evening_et = datetime(2026, 8, 19, 2, 0, tzinfo=UTC)
    _snap(s, as_of=late_evening_et, next_report_date=date(2026, 8, 19))
    page = pages.ticker_page(s, "NVDA", now=late_evening_et)
    assert page.days_until_report == 1


def test_cold_ticker_renders_with_empty_states(s):
    page = pages.ticker_page(s, "ZZZZ", now=NOW)

    assert page.is_tracked is False
    assert page.options is None
    assert page.history == []
    assert page.stats is None
    assert page.ticker == "ZZZZ"


def test_ticker_is_normalised(s):
    _snap(s)
    assert pages.ticker_page(s, "  nvda ", now=NOW).ticker == "NVDA"


def test_direction_shown_when_the_signal_matches_the_next_report(s):
    _snap(s, next_report_date=date(2026, 8, 26))
    ev = repo.upsert_earnings_event(s, "NVDA", date(2026, 8, 26))
    repo.save_signal(
        s,
        ticker="NVDA",
        run_date=date(2026, 8, 24),
        workflow="B",
        event=ev,
        implied_move=None,
        hist_avg_move=None,
        verdict=None,
        edge_score=None,
        direction="BULLISH",
        confidence=0.7,
    )
    s.commit()

    page = pages.ticker_page(s, "NVDA", now=NOW)
    assert page.direction == "BULLISH"
    assert page.direction_confidence == 0.7
    assert page.direction_as_of == date(2026, 8, 24)


def test_direction_hidden_when_the_only_signal_is_for_a_past_report(s):
    """A ticker between its last print and the next one has a Workflow-B row
    on file, but it isn't about the report `next_report_date` is pointing at
    -- showing it would read as a live call it isn't."""
    _snap(s, next_report_date=date(2026, 11, 25))
    ev = repo.upsert_earnings_event(s, "NVDA", date(2026, 8, 26))
    repo.save_signal(
        s,
        ticker="NVDA",
        run_date=date(2026, 8, 24),
        workflow="B",
        event=ev,
        implied_move=None,
        hist_avg_move=None,
        verdict=None,
        edge_score=None,
        direction="BULLISH",
        confidence=0.7,
    )
    s.commit()

    page = pages.ticker_page(s, "NVDA", now=NOW)
    assert page.direction is None
    assert page.direction_confidence is None


def test_direction_none_when_never_computed(s):
    _snap(s, next_report_date=date(2026, 8, 26))
    assert pages.ticker_page(s, "NVDA", now=NOW).direction is None


# ---- spot price fallback ----------------------------------------------------


def _prices(*closes: float) -> list:
    from app.schemas import PricePoint

    return [PricePoint(date=date(2026, 7, 1 + i), close=c) for i, c in enumerate(closes)]


def test_snapshot_less_ticker_falls_back_to_latest_close(s):
    """A ticker with no snapshot still has yfinance-fetched daily closes — the
    header shouldn't show an em dash for a number that's sitting right there
    in the chart data."""
    page = pages.ticker_page(s, "COST", prices=_prices(950.0, 958.25), now=NOW)
    assert page.spot == 958.25


def test_snapshot_spot_wins_over_the_price_series_fallback(s):
    """The snapshot's spot is the real thing (captured at cron time); the
    daily-close fallback only fills the gap when there isn't one."""
    _snap(s, spot=223.76)
    page = pages.ticker_page(s, "NVDA", prices=_prices(220.0, 221.5), now=NOW)
    assert page.spot == 223.76


def test_no_prices_and_no_snapshot_leaves_spot_none(s):
    page = pages.ticker_page(s, "ZZZZ", now=NOW)
    assert page.spot is None


def test_snapshot_with_a_null_spot_still_falls_back_to_price_series(s):
    """A snapshot can exist (options data, news) without a spot (e.g. the
    underlying price fetch failed that night) — the fallback should still
    kick in rather than leaving a real, available number blank."""
    _snap(s, spot=None)
    page = pages.ticker_page(s, "NVDA", prices=_prices(180.0, 182.4), now=NOW)
    assert page.spot == 182.4


# ---- the guarantee the hosting model depends on ----------------------------


def test_read_path_makes_no_metered_calls(s, monkeypatch):
    """A page view must cost zero Massive and zero RapidAPI calls. If this ever
    fails, public traffic starts spending real money per visitor.

    Mirrors the discipline the engine's tests/test_static_gen.py enforces on
    the old Jinja site.
    """
    import earnings.data.massive as massive
    import earnings.data.seeking_alpha as seeking_alpha

    def boom(*a, **kw):
        raise AssertionError("read path made a metered API call")

    monkeypatch.setattr(massive, "MassiveClient", boom)
    monkeypatch.setattr(seeking_alpha, "SeekingAlphaClient", boom)

    _snap(s, implied_move=0.08, hist_avg_move=0.06, verdict="RICH")
    page = pages.ticker_page(s, "NVDA", now=NOW)

    assert page.options.verdict == "RICH"


# ---- past_earnings_page -----------------------------------------------------


def _past_row(ticker="NVDA", report_date=date(2026, 7, 22), **kw):
    from earnings.store.repo import PastEarningsRow

    base = dict(
        session=None,
        eps_estimate=None,
        eps_actual=None,
        eps_surprise=None,
        implied_move=None,
        verdict=None,
        direction=None,
        realized_move=None,
        beat_implied=None,
        gap_open_pct=None,
        gap_filled=None,
        vol_ratio=None,
        pnl=None,
    )
    return PastEarningsRow(ticker=ticker, report_date=report_date, **{**base, **kw})


def test_past_earnings_page_merges_workflow_a_and_b_for_one_event():
    """Two rows for the same (ticker, date) — one per workflow — collapse to
    one, same as history_rows does for the single-ticker case."""
    page = pages.past_earnings_page(
        [
            _past_row(verdict="RICH", implied_move=0.08),
            _past_row(direction="BULLISH", realized_move=0.03),
        ]
    )
    assert len(page.rows) == 1
    assert page.rows[0].verdict == "RICH"
    assert page.rows[0].direction == "BULLISH"


def test_past_earnings_page_merge_does_not_overwrite_a_known_value():
    page = pages.past_earnings_page([_past_row(verdict="RICH"), _past_row(verdict="CHEAP")])
    assert page.rows[0].verdict == "RICH"


def test_past_earnings_page_keeps_distinct_tickers_and_dates_separate():
    page = pages.past_earnings_page(
        [
            _past_row(ticker="NVDA", report_date=date(2026, 7, 22)),
            _past_row(ticker="AMD", report_date=date(2026, 7, 22)),
            _past_row(ticker="NVDA", report_date=date(2026, 4, 22)),
        ]
    )
    keys = {(r.ticker, r.report_date) for r in page.rows}
    assert keys == {
        ("NVDA", date(2026, 7, 22)),
        ("AMD", date(2026, 7, 22)),
        ("NVDA", date(2026, 4, 22)),
    }


def test_past_earnings_page_preserves_input_order():
    """repo.past_earnings already sorts newest-first; the merge must not
    re-shuffle that."""
    page = pages.past_earnings_page(
        [
            _past_row(ticker="B", report_date=date(2026, 7, 30)),
            _past_row(ticker="A", report_date=date(2026, 7, 22)),
        ]
    )
    assert [r.ticker for r in page.rows] == ["B", "A"]


def test_past_earnings_page_empty_input():
    assert pages.past_earnings_page([]).rows == []


def test_past_earnings_page_attaches_current_spot_from_snapshot():
    """spot is today's price via the latest snapshot, not a historical field —
    a ticker that's been re-snapshotted since the print shows its current
    price next to a quarter-old event."""
    page = pages.past_earnings_page([_past_row(ticker="NVDA")], {"NVDA": _FakeSnap(spot=180.5)})
    assert page.rows[0].spot == 180.5


def test_past_earnings_page_spot_is_none_without_a_snapshot():
    page = pages.past_earnings_page([_past_row(ticker="ZZZZ")], {})
    assert page.rows[0].spot is None


def test_past_earnings_page_falls_back_to_latest_close_without_a_snapshot():
    page = pages.past_earnings_page([_past_row(ticker="AAPL")], {}, {"AAPL": 227.5})
    assert page.rows[0].spot == 227.5


def test_past_earnings_page_snapshot_spot_wins_over_latest_close():
    page = pages.past_earnings_page(
        [_past_row(ticker="NVDA")], {"NVDA": _FakeSnap(spot=180.5)}, {"NVDA": 100.0}
    )
    assert page.rows[0].spot == 180.5


class _FakeSnap:
    """A minimal stand-in for DashboardSnapshot — these tests only read .spot,
    so a full ORM row would be needlessly heavy to construct."""

    def __init__(self, spot: float | None):
        self.spot = spot


# ---- calendar_page ----------------------------------------------------------


def _upcoming(ticker="PLTR", report_date=date(2026, 8, 3), **kw):
    from earnings.store.repo import UpcomingEvent

    base = dict(session=None, verdict=None, direction=None)
    return UpcomingEvent(ticker=ticker, report_date=report_date, **{**base, **kw})


def test_calendar_page_merges_a_dual_workflow_event_into_one_entry():
    """A ticker with both a Workflow-A (verdict) and Workflow-B (direction)
    signal for the same report arrives as two UpcomingEvent rows — regression
    caught on the month calendar, which rendered the ticker chip twice."""
    page = pages.calendar_page(
        [
            _upcoming(verdict="RICH"),
            _upcoming(direction="BULLISH"),
        ],
        {},
        as_of=date(2026, 8, 1),
        window_days=30,
    )
    assert len(page.entries) == 1
    assert page.entries[0].verdict == "RICH"
    assert page.entries[0].direction == "BULLISH"


def test_calendar_page_keeps_distinct_tickers_and_dates_separate():
    page = pages.calendar_page(
        [
            _upcoming(ticker="PLTR", report_date=date(2026, 8, 3)),
            _upcoming(ticker="AMD", report_date=date(2026, 8, 3)),
            _upcoming(ticker="PLTR", report_date=date(2026, 8, 10)),
        ],
        {},
        as_of=date(2026, 8, 1),
        window_days=30,
    )
    keys = {(e.ticker, e.report_date) for e in page.entries}
    assert keys == {
        ("PLTR", date(2026, 8, 3)),
        ("AMD", date(2026, 8, 3)),
        ("PLTR", date(2026, 8, 10)),
    }


def test_calendar_page_attaches_current_spot_from_snapshot(s):
    snap = _snap(s, ticker="PLTR", spot=42.1)
    page = pages.calendar_page(
        [_upcoming(ticker="PLTR")],
        {"PLTR": snap},
        as_of=date(2026, 8, 1),
        window_days=30,
    )
    assert page.entries[0].spot == 42.1


def test_calendar_page_days_until_can_go_negative_for_past_events():
    """The full-window calendar includes past events; a 12-days-ago print must
    read as -12, not be clamped to 0."""
    page = pages.calendar_page(
        [_upcoming(report_date=date(2026, 7, 20))],
        {},
        as_of=date(2026, 8, 1),
        window_days=545,
    )
    assert page.entries[0].days_until == -12


# ---- signals_page -------------------------------------------------------------


def _signal_row(ticker="NVDA", **kw):
    from earnings.store.repo import SignalFeedRow

    base = dict(
        run_date=date(2026, 8, 1),
        report_date=date(2026, 8, 26),
        workflow="A",
        verdict=None,
        direction=None,
        implied_move=None,
        edge_score=None,
        confidence=None,
        beat_implied=None,
        correct_direction=None,
    )
    return SignalFeedRow(ticker=ticker, **{**base, **kw})


def test_signals_page_attaches_current_spot_from_snapshot():
    page = pages.signals_page([_signal_row(ticker="NVDA")], {"NVDA": _FakeSnap(spot=223.76)})
    assert page.rows[0].spot == 223.76


def test_signals_page_spot_is_none_without_a_snapshot():
    page = pages.signals_page([_signal_row(ticker="ZZZZ")])
    assert page.rows[0].spot is None


def test_signals_page_falls_back_to_latest_close_without_a_snapshot():
    """A ticker that's aged out of the tracked universe still has a real,
    freely-available price — same fallback as the ticker page."""
    page = pages.signals_page([_signal_row(ticker="AAPL")], {}, {"AAPL": 227.5})
    assert page.rows[0].spot == 227.5


def test_signals_page_snapshot_spot_wins_over_latest_close():
    page = pages.signals_page(
        [_signal_row(ticker="NVDA")], {"NVDA": _FakeSnap(spot=223.76)}, {"NVDA": 180.0}
    )
    assert page.rows[0].spot == 223.76


def test_signals_page_carries_the_outcome_through():
    page = pages.signals_page([_signal_row(ticker="NVDA", beat_implied=True)])
    assert page.rows[0].beat_implied is True
    assert page.rows[0].correct_direction is None


# ---- peers -----------------------------------------------------------------
#
# The peers panel reads other tickers' last_earnings_json off their snapshots,
# grouped by curated cohort (else sector). Cross-ticker, so these seed several
# snapshots and assert who shows up on whose page.


def _le_json(report_date: str, move: float, before: float = 100.0) -> str:
    return json.dumps(
        {
            "report_date": report_date,
            "session": "AMC",
            "price_before": before,
            "price_after": before * (1 + move),
            "move": move,
        }
    )


def test_peers_attaches_curated_cohort_with_before_after_prices(s):
    _snap(s, "NVDA")  # the page under test — no last_earnings needed for itself
    _snap(s, "AMD", last_earnings_json=_le_json("2026-08-05", 0.072, before=150.0))
    _snap(s, "INTC", last_earnings_json=_le_json("2026-07-25", -0.031, before=40.0))

    peers = pages.ticker_page(s, "NVDA", now=NOW).peers
    by_ticker = {p.ticker: p for p in peers}
    assert {"AMD", "INTC"} <= set(by_ticker)
    amd = by_ticker["AMD"]
    assert amd.price_before == 150.0
    assert amd.price_after == pytest.approx(150.0 * 1.072)
    assert amd.move == pytest.approx(0.072)
    assert amd.report_date == date(2026, 8, 5)


def test_peers_omit_names_without_recent_earnings(s):
    _snap(s, "NVDA")
    _snap(s, "AMD", last_earnings_json=_le_json("2026-08-05", 0.05))
    _snap(s, "AVGO")  # curated peer, but no last_earnings yet
    _snap(s, "INTC", last_earnings_json=_le_json("2026-07-25", -0.02))

    tickers = [p.ticker for p in pages.ticker_page(s, "NVDA", now=NOW).peers]
    assert "AVGO" not in tickers


def test_peers_empty_when_cohort_has_no_data(s):
    """A tracked name whose peers have no recent-earnings data yet gets an
    empty list — the UI drops the panel rather than showing a stub."""
    _snap(s, "NVDA")
    assert pages.ticker_page(s, "NVDA", now=NOW).peers == []


def test_peers_survive_a_malformed_last_earnings_blob(s):
    _snap(s, "NVDA")
    _snap(s, "AMD", last_earnings_json="{broken")
    _snap(s, "INTC", last_earnings_json=_le_json("2026-07-25", -0.02))
    # AMD drops out (bad blob), leaving only INTC -> below MIN_PEERS -> [].
    assert pages.ticker_page(s, "NVDA", now=NOW).peers == []


def test_build_peer_index_carries_industry_and_last_earnings(s):
    _snap(
        s,
        "AMD",
        sector="Technology",
        industry="Semiconductors",
        last_earnings_json=_le_json("2026-08-05", 0.05),
    )
    _snap(s, "KO", sector="Consumer Defensive", industry="Beverages - Non-Alcoholic")
    index = pages.build_peer_index(s)
    assert index["AMD"].industry == "Semiconductors"
    assert index["AMD"].last_earnings.move == pytest.approx(0.05)
    assert index["KO"].last_earnings is None  # no blob -> None, not an error


# ---- past moves ------------------------------------------------------------
#
# The observations behind hist_avg_move, stored as JSON on the snapshot. The
# column is new, so "absent" is a normal not-yet state for every row written
# before it existed — never an error.


def test_past_moves_parses_stored_rows(s):
    _snap(
        s,
        past_moves_json=json.dumps(
            [
                {"report_date": "2026-05-20", "move": -0.061},
                {"report_date": "2026-02-25", "move": 0.084},
            ]
        ),
    )
    moves = pages.ticker_page(s, "NVDA", now=NOW).past_moves

    assert [m.report_date for m in moves] == [date(2026, 5, 20), date(2026, 2, 25)]
    assert moves[0].move == pytest.approx(-0.061)


def test_past_moves_absent_is_empty_not_an_error(s):
    """Every snapshot written before this column existed has no value —
    that's a not-yet, and the page must still render."""
    _snap(s)
    assert pages.ticker_page(s, "NVDA", now=NOW).past_moves == []


def test_past_moves_survives_a_malformed_blob(s):
    """A bad blob must not take the whole ticker page down with it — same
    contract _ai_summary already follows."""
    _snap(s, past_moves_json="{not json at all")
    assert pages.ticker_page(s, "NVDA", now=NOW).past_moves == []


def test_past_moves_skips_individually_bad_rows(s):
    """One unparseable entry shouldn't discard the rows around it."""
    _snap(
        s,
        past_moves_json=json.dumps(
            [
                {"report_date": "2026-05-20", "move": -0.061},
                {"report_date": "2026-02-25"},  # no move
                {"move": 0.02},  # no date
                {"report_date": "2025-11-19", "move": "not a number"},
                {"report_date": "2025-08-20", "move": 0.033},
            ]
        ),
    )
    moves = pages.ticker_page(s, "NVDA", now=NOW).past_moves
    assert [m.report_date for m in moves] == [date(2026, 5, 20), date(2025, 8, 20)]


def test_track_record_page_carries_every_field_through():
    """A field silently dropped between the engine's TrackRecord and the
    wire schema is exactly the class of bug this guards against — the whole
    point of rich_edge/cheap_edge existing is that they reach the page."""
    record = TrackRecord(
        scored=10,
        directional=8,
        correct=5,
        accuracy=0.625,
        avg_long_straddle_pnl=-0.05,
        dir_scored=2,
        dir_correct=1,
        dir_accuracy=None,
        rich_edge=0.277,
        rich_edge_scored=38,
        cheap_edge=0.109,
        cheap_edge_scored=16,
        structure_scored=61,
        structure_wins=40,
        structure_win_rate=0.656,
        structure_avg_pnl_pct=0.142,
        structure_sell_scored=38,
        structure_sell_win_rate=0.71,
        structure_sell_avg_pnl_pct=-0.052,
        structure_buy_scored=23,
        structure_buy_win_rate=0.56,
        structure_buy_avg_pnl_pct=0.28,
    )
    page = pages.track_record_page(record)
    assert page.scored == 10
    assert page.directional == 8
    assert page.correct == 5
    assert page.accuracy == 0.625
    assert page.avg_long_straddle_pnl == -0.05
    assert page.dir_scored == 2
    assert page.dir_correct == 1
    assert page.dir_accuracy is None
    assert page.rich_edge == 0.277
    assert page.rich_edge_scored == 38
    assert page.cheap_edge == 0.109
    assert page.cheap_edge_scored == 16
    assert page.structure_scored == 61
    assert page.structure_wins == 40
    assert page.structure_win_rate == 0.656
    assert page.structure_avg_pnl_pct == 0.142
    assert page.structure_sell_scored == 38
    assert page.structure_sell_win_rate == 0.71
    assert page.structure_sell_avg_pnl_pct == -0.052
    assert page.structure_buy_scored == 23
    assert page.structure_buy_win_rate == 0.56
    assert page.structure_buy_avg_pnl_pct == 0.28
