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
