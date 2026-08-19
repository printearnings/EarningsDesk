"""Tests for quotes.price_series' NaN handling.

A NaN close (a data gap from yfinance, not a real price) isn't valid JSON
once serialized — Python's json module writes it as the bare token `NaN`,
which no spec-compliant JSON.parse accepts. One bad row broke the static
build for every ticker whose latest bar happened to land on one; these
lock in the fix so it can't regress silently.
"""

from __future__ import annotations

import math

import pandas as pd
import pytest

from app.services import quotes


@pytest.fixture(autouse=True)
def _clear_cache():
    quotes.clear_cache()
    yield
    quotes.clear_cache()


def _bars(rows: list[dict]) -> pd.DataFrame:
    """A daily_ohlcv-shaped frame: date-indexed, Open/High/Low/Close/Volume."""
    df = pd.DataFrame(rows)
    df.index = pd.to_datetime(df.pop("date"))
    return df


def test_row_with_nan_close_is_dropped(monkeypatch):
    """The specific incident: a trailing NaN close must not become a NaN
    PricePoint — there's nothing valid to plot for that day anyway."""
    bars = _bars(
        [
            {
                "date": "2026-08-17",
                "Open": 10.0,
                "High": 10.5,
                "Low": 9.8,
                "Close": 10.2,
                "Volume": 1000,
            },
            {
                "date": "2026-08-18",
                "Open": 10.2,
                "High": 10.2,
                "Low": 10.2,
                "Close": float("nan"),
                "Volume": float("nan"),
            },
        ]
    )
    monkeypatch.setattr(quotes.prices, "daily_ohlcv", lambda ticker: bars)

    series = quotes.price_series("NVDA")

    assert len(series) == 1
    assert series[0].close == 10.2
    assert not any(math.isnan(p.close) for p in series)


def test_nan_open_high_low_become_none_not_nan(monkeypatch):
    """close is required on PricePoint; open/high/low are optional — a NaN
    in one of those should degrade to None (renders as an em dash), the
    same contract volume already had before this fix, never a raw NaN."""
    bars = _bars(
        [
            {
                "date": "2026-08-18",
                "Open": float("nan"),
                "High": float("nan"),
                "Low": float("nan"),
                "Close": 10.2,
                "Volume": 1000,
            },
        ]
    )
    monkeypatch.setattr(quotes.prices, "daily_ohlcv", lambda ticker: bars)

    series = quotes.price_series("NVDA")

    assert len(series) == 1
    assert series[0].close == 10.2
    assert series[0].open is None
    assert series[0].high is None
    assert series[0].low is None


def test_all_nan_closes_yields_empty_series(monkeypatch):
    bars = _bars(
        [
            {
                "date": "2026-08-18",
                "Open": 1.0,
                "High": 1.0,
                "Low": 1.0,
                "Close": float("nan"),
                "Volume": 1.0,
            },
        ]
    )
    monkeypatch.setattr(quotes.prices, "daily_ohlcv", lambda ticker: bars)

    assert quotes.price_series("NVDA") == []
