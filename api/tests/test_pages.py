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
from earnings.store.repo import TimelineEvent
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

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
    )
    panel = pages.options_panel(snap)

    assert panel.verdict == "RICH"
    assert panel.richness == pytest.approx(0.3333, abs=1e-3)
    assert panel.iv_inverted is True
    assert panel.put_call_ratio == 0.57


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
        [_tl(date(2026, 5, 20), session="AMC", eps_estimate=1.77, eps_actual=1.87,
             eps_surprise=5.54)]
    )
    assert (rows[0].session, rows[0].eps_surprise) == ("AMC", 5.54)


# ---- news / summary parsing ------------------------------------------------


def test_failed_news_fetch_is_null_not_empty(s):
    """The UI needs to distinguish "couldn't load" from "nothing happening"."""
    assert pages._news(_snap(s, news_json=None)) is None
    assert pages._news(_snap(s, news_json=json.dumps([]))) == []


def test_malformed_news_json_degrades_to_none(s):
    assert pages._news(_snap(s, news_json="{not json")) is None


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


def test_stale_snapshot_is_flagged(s):
    """One missed nightly run is tolerated; two is not, and the reader must be
    told rather than shown old numbers as current."""
    _snap(s, as_of=NOW - timedelta(hours=48))
    assert pages.ticker_page(s, "NVDA", now=NOW).is_stale is True


def test_days_until_report(s):
    _snap(s, next_report_date=date(2026, 8, 26))
    assert pages.ticker_page(s, "NVDA", now=NOW).days_until_report == 18


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
    page = pages.past_earnings_page(
        [_past_row(verdict="RICH"), _past_row(verdict="CHEAP")]
    )
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
