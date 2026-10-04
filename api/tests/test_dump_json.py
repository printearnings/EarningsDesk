"""Tests for _sanitize_nan — the last-line-of-defense that keeps a stray
NaN/Infinity anywhere in a model from producing invalid JSON. quotes.py's
NaN-close fix addresses the one known source; this is the backstop for
whichever source produces the next one.
"""

from __future__ import annotations

import math

from app.dump_json import _sanitize_nan


def test_nan_float_becomes_none():
    assert _sanitize_nan(float("nan")) is None


def test_infinity_becomes_none():
    assert _sanitize_nan(float("inf")) is None
    assert _sanitize_nan(float("-inf")) is None


def test_ordinary_float_is_unchanged():
    assert _sanitize_nan(3.14) == 3.14


def test_non_float_values_pass_through():
    assert _sanitize_nan("RICH") == "RICH"
    assert _sanitize_nan(None) is None
    assert _sanitize_nan(42) == 42
    assert _sanitize_nan(True) is True


def test_nested_dict_and_list_are_sanitized_recursively():
    data = {
        "ticker": "NVDA",
        "spot": float("nan"),
        "history": [
            {"date": "2026-08-18", "close": 10.2},
            {"date": "2026-08-19", "close": float("nan")},
        ],
    }
    cleaned = _sanitize_nan(data)

    assert cleaned["spot"] is None
    assert cleaned["history"][0]["close"] == 10.2
    assert cleaned["history"][1]["close"] is None
    # Never left an unsanitized float anywhere in the tree.
    assert not any(
        isinstance(v, float) and math.isnan(v) for row in cleaned["history"] for v in row.values()
    )


# ---- recovering pages Yahoo refused (Oct 2026) -------------------------------


def _recover_with(monkeypatch, *, refetch: dict[str, int], published: dict[str, list]):
    """Run _recover with the pause, the quote cache and the published site
    stubbed. `refetch` is the price-point count a retry returns per ticker;
    `published` the prices on the live copy."""
    from app import dump_json
    from app.schemas import PricePoint, TickerPage

    monkeypatch.setattr(dump_json.time, "sleep", lambda s: None)
    monkeypatch.setattr(dump_json.quotes, "forget", lambda t: None)

    def page(t):
        if t not in published:
            return None
        pts = [PricePoint(date=f"2026-10-0{i + 1}", close=c) for i, c in enumerate(published[t])]
        return TickerPage(ticker=t, prices=pts)

    monkeypatch.setattr(dump_json, "_published_page", lambda http, t: page(t))
    calls: list[tuple[str, bool]] = []

    def render(t, fallback=None):
        calls.append((t, fallback is not None))
        if fallback is not None:
            return len(fallback.prices)
        return refetch.get(t, 0)

    dump_json._recover(list(refetch), render)
    return calls


def test_a_refused_page_is_retried_then_falls_back_to_the_published_copy(monkeypatch):
    calls = _recover_with(
        monkeypatch,
        refetch={"NVDA": 252, "DAL": 0, "ZZZZ": 0},
        published={"DAL": [44.1, 45.2], "ZZZZ": []},
    )
    assert ("NVDA", False) in calls  # recovered on the retry
    assert ("NVDA", True) not in calls
    assert ("DAL", True) in calls  # reused yesterday's chart
    assert ("ZZZZ", True) not in calls  # the live copy was empty too
