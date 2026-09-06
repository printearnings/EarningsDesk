"""Tests for peer resolution (curated-first, industry fallback).

Pure and index-driven — no DB, no network. Fabricate a universe snapshot and
assert who resolves as whose peer, and in what order.
"""

from __future__ import annotations

from datetime import date

from app.peers import MIN_PEERS, PeerRecord, resolve_peers
from app.schemas import PeerEarnings


def _pe(ticker: str, report_date: date, move: float = 0.05) -> PeerEarnings:
    return PeerEarnings(
        ticker=ticker,
        report_date=report_date,
        session="AMC",
        price_before=100.0,
        price_after=100.0 * (1 + move),
        move=move,
    )


def _rec(ticker, *, industry=None, report_date=None) -> PeerRecord:
    return PeerRecord(
        ticker=ticker,
        company_name=ticker + " Inc",
        company_domain=None,
        sector=None,  # matching is on industry now
        industry=industry,
        last_earnings=_pe(ticker, report_date) if report_date else None,
    )


def _index(*recs: PeerRecord) -> dict[str, PeerRecord]:
    return {r.ticker: r for r in recs}


def test_curated_peers_resolve_in_curated_order():
    idx = _index(
        _rec("NVDA", industry="Technology", report_date=date(2026, 8, 1)),
        _rec("AMD", industry="Technology", report_date=date(2026, 8, 2)),
        _rec("AVGO", industry="Technology", report_date=date(2026, 8, 3)),
        _rec("INTC", industry="Technology", report_date=date(2026, 8, 4)),
    )
    peers = resolve_peers("NVDA", idx)
    # CURATED["NVDA"] starts AMD, AVGO, ... — curated order, not report recency.
    assert [p.ticker for p in peers][:3] == ["AMD", "AVGO", "INTC"]


def test_query_is_case_insensitive():
    idx = _index(
        _rec("NVDA", report_date=date(2026, 8, 1)),
        _rec("AMD", report_date=date(2026, 8, 2)),
        _rec("INTC", report_date=date(2026, 8, 3)),
    )
    assert resolve_peers("nvda", idx)  # lowercased query still resolves


def test_self_is_never_a_peer():
    idx = _index(
        _rec("AMD", report_date=date(2026, 8, 1)),
        _rec("NVDA", report_date=date(2026, 8, 2)),
        _rec("INTC", report_date=date(2026, 8, 3)),
    )
    assert "AMD" not in [p.ticker for p in resolve_peers("AMD", idx)]


def test_peers_without_recent_earnings_are_excluded():
    """A card needs a before/after price. A curated peer with no last_earnings
    contributes nothing to a 'how did the cohort's prints go' panel."""
    idx = _index(
        _rec("NVDA", report_date=date(2026, 8, 1)),
        _rec("AMD", report_date=date(2026, 8, 2)),
        _rec("AVGO"),  # no last_earnings
        _rec("INTC", report_date=date(2026, 8, 3)),
    )
    tickers = [p.ticker for p in resolve_peers("NVDA", idx)]
    assert "AVGO" not in tickers
    assert {"AMD", "INTC"} <= set(tickers)


def test_below_min_peers_returns_empty():
    """One lonely card reads as broken. Only one usable peer and no industry-mates
    to top up with -> drop the panel."""
    assert MIN_PEERS == 2
    idx = _index(
        _rec("NVDA", report_date=date(2026, 8, 1)),  # no industry, so no fallback
        _rec("AMD", report_date=date(2026, 8, 2)),  # only one usable curated peer
    )
    assert resolve_peers("NVDA", idx) == []


def test_insufficient_curated_tops_up_from_industry():
    """A name with only one curated peer in-window must not vanish — the industry
    fallback fills the panel rather than showing nothing."""
    idx = _index(
        _rec("NVDA", industry="Technology", report_date=date(2026, 8, 1)),
        _rec("AMD", industry="Technology", report_date=date(2026, 8, 2)),  # curated peer
        _rec("ACN", industry="Technology", report_date=date(2026, 8, 3)),  # industry-only
        _rec("PAYX", industry="Technology", report_date=date(2026, 8, 4)),  # industry-only
    )
    tickers = [p.ticker for p in resolve_peers("NVDA", idx)]
    assert tickers[0] == "AMD"  # curated stays first
    assert {"ACN", "PAYX"} <= set(tickers)  # topped up from industry


def test_sufficient_curated_is_not_diluted_by_industry():
    """When curated already fills the panel, don't append less-relevant
    same-industry names."""
    idx = _index(
        _rec("NVDA", industry="Technology", report_date=date(2026, 8, 1)),
        _rec("AMD", industry="Technology", report_date=date(2026, 8, 2)),  # curated
        _rec("AVGO", industry="Technology", report_date=date(2026, 8, 3)),  # curated
        _rec("ACN", industry="Technology", report_date=date(2026, 8, 9)),  # industry-only, newest
    )
    tickers = [p.ticker for p in resolve_peers("NVDA", idx)]
    assert "ACN" not in tickers  # curated (AMD, AVGO) already meets MIN_PEERS


def test_industry_fallback_when_no_curated_list():
    """A name with no curated cohort falls back to same-industry tracked names,
    most-recent print first."""
    idx = _index(
        _rec("ZZZA", industry="Widgets", report_date=date(2026, 7, 1)),  # query, no CURATED entry
        _rec("ZZZB", industry="Widgets", report_date=date(2026, 8, 5)),
        _rec("ZZZC", industry="Widgets", report_date=date(2026, 8, 9)),
        _rec("ZZZD", industry="Gadgets", report_date=date(2026, 8, 8)),  # wrong industry
    )
    peers = resolve_peers("ZZZA", idx)
    assert [p.ticker for p in peers] == ["ZZZC", "ZZZB"]  # recency order, Gadgets excluded


def test_industry_fallback_needs_an_industry():
    idx = _index(
        _rec("ZZZA", industry=None, report_date=date(2026, 7, 1)),
        _rec("ZZZB", industry="Widgets", report_date=date(2026, 8, 5)),
        _rec("ZZZC", industry="Widgets", report_date=date(2026, 8, 9)),
    )
    assert resolve_peers("ZZZA", idx) == []


def test_result_is_capped():
    # Eight same-industry mates, no curated entry -> capped at MAX_PEERS (6).
    recs = [_rec("QQQ0", industry="Widgets", report_date=date(2026, 7, 1))]
    recs += [_rec(f"QQQ{i}", industry="Widgets", report_date=date(2026, 8, i)) for i in range(1, 9)]
    peers = resolve_peers("QQQ0", _index(*recs))
    assert len(peers) == 6
