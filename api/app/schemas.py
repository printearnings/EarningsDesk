"""Response models — the single definition of the wire format.

These are serialized two ways from the same classes: by FastAPI for the local
dev server, and by `app.dump_json` into static files for Cloudflare Pages.
Defining them once is the whole reason the dev server still exists after we
moved to static hosting — the frontend's TypeScript types are generated from
this schema, so a field renamed here breaks the build rather than the page.

Convention: `None` means "we don't know", never "zero". A NULL put/call ratio
renders as a gap in the UI, not as 0.00.
"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


class PricePoint(BaseModel):
    date: date
    close: float
    open: float | None = None
    high: float | None = None
    low: float | None = None
    volume: float | None = None


class EarningsHistoryRow(BaseModel):
    """One past (or upcoming) earnings event, everything we know about it."""

    report_date: date
    session: str | None = Field(None, description='"BMO" | "AMC" | null when unknown')

    eps_estimate: float | None = None
    eps_actual: float | None = None
    eps_surprise: float | None = Field(None, description="percent, e.g. 5.54 == +5.54%")

    implied_move: float | None = Field(None, description="fraction, e.g. 0.078 == ±7.8%")
    realized_move: float | None = Field(None, description="signed close-to-close fraction")
    beat_implied: bool | None = None

    verdict: str | None = Field(None, description="RICH | CHEAP | FAIR")
    direction: str | None = Field(None, description="BULLISH | BEARISH | NEUTRAL")
    correct_direction: bool | None = None

    gap_open_pct: float | None = None
    gap_filled: bool | None = None
    vol_ratio: float | None = Field(None, description="earnings-day volume / 20d average")
    pnl: float | None = Field(None, description="long-straddle proxy return")

    @property
    def is_upcoming(self) -> bool:
        return self.realized_move is None


class NewsItem(BaseModel):
    """One story. Only `title` is guaranteed — a feed item can arrive without a
    resolvable link, and the UI renders those as plain text rather than as a
    dead anchor."""

    title: str
    url: str | None = None
    publisher: str | None = None
    published_at: str | None = None
    thumbnail_url: str | None = None


class DashboardNewsItem(NewsItem):
    """A `NewsItem` plus which tracked company it's about — the ticker page's
    news list needs no such field (it's implicitly the page's own ticker),
    but a feed spanning the whole universe has to say whose story this is."""

    ticker: str
    company_name: str | None = None
    company_domain: str | None = None


class DashboardNewsPage(BaseModel):
    items: list[DashboardNewsItem]


class HistoryStats(BaseModel):
    """Aggregates over the earnings history. Mirrors core.llm_context.TickerContext.

    `hit_rate` is null below 4 scored events on purpose — a single correct call
    reads as 100% accuracy and that number would get screenshotted. See
    MIN_EVENTS_FOR_HIT_RATE.
    """

    n_events: int
    hit_rate: float | None = None
    avg_pnl: float | None = None
    avg_implied_move: float | None = None
    avg_realized_move: float | None = None
    overpricing_bias: float | None = Field(
        None, description="positive = market consistently overestimates the move"
    )
    avg_gap_open_pct: float | None = None
    gap_fill_rate: float | None = None
    avg_vol_ratio: float | None = None


class StrikeOpenInterest(BaseModel):
    """Open interest at one strike, split by side — one bar of the
    open-interest-by-strike chart."""

    strike: float
    call_oi: int
    put_oi: int


class OptionsPanel(BaseModel):
    """What the options market is pricing right now (as of the snapshot)."""

    implied_move: float | None = None
    hist_avg_move: float | None = None
    richness: float | None = Field(
        None, description="implied / historical - 1; +0.30 means 30% richer than typical"
    )
    verdict: str | None = None
    edge_score: float | None = Field(None, description="0-10")

    put_call_ratio: float | None = None
    atm_open_interest: int | None = None
    atm_strike: float | None = None
    atm_expiry: date | None = None

    call_volume: int | None = Field(None, description="today's total call contracts traded")
    put_volume: int | None = Field(None, description="today's total put contracts traded")
    atm_volume: int | None = Field(
        None, description="today's call+put volume at the ATM strike, vs. atm_open_interest"
    )
    oi_by_strike: list[StrikeOpenInterest] | None = Field(
        None, description="a window of strikes around the ATM, for a liquidity chart"
    )

    iv_front: float | None = None
    iv_back: float | None = None
    iv_inverted: bool | None = Field(
        None, description="front IV above back IV — the earnings premium"
    )


class Fundamentals(BaseModel):
    """Company ratio grid — valuation, profitability, ownership, float.

    Every field optional: yfinance omits a key entirely for a company that
    genuinely has no such value (no dividend, no analyst coverage, a recent
    IPO with no trailing EPS). That absence is information, and renders as
    an em dash rather than a zero.
    """

    market_cap: float | None = None
    enterprise_value: float | None = None
    trailing_pe: float | None = None
    forward_pe: float | None = None
    peg_ratio: float | None = None
    price_to_book: float | None = None
    price_to_sales: float | None = None

    return_on_equity: float | None = None
    return_on_assets: float | None = None
    gross_margin: float | None = None
    operating_margin: float | None = None
    profit_margin: float | None = None

    revenue_growth: float | None = None
    earnings_growth: float | None = None

    trailing_eps: float | None = None
    forward_eps: float | None = None

    debt_to_equity: float | None = None
    current_ratio: float | None = None
    quick_ratio: float | None = None

    held_pct_insiders: float | None = None
    held_pct_institutions: float | None = None
    shares_outstanding: float | None = None
    float_shares: float | None = None
    short_ratio: float | None = None
    short_pct_of_float: float | None = None

    beta: float | None = None
    fifty_two_week_high: float | None = None
    fifty_two_week_low: float | None = None

    dividend_yield: float | None = None
    payout_ratio: float | None = None

    target_mean_price: float | None = None
    recommendation_mean: float | None = Field(None, description="1-5, lower = more bullish")
    number_of_analysts: float | None = None


class AnalystRatingRow(BaseModel):
    """One analyst upgrade/downgrade/initiation, as filed."""

    date: date
    firm: str | None = None
    action: str | None = Field(None, description="up | down | init | main | reit")
    from_grade: str | None = None
    to_grade: str | None = None
    price_target_action: str | None = None
    current_price_target: float | None = None
    prior_price_target: float | None = None


class AiSummary(BaseModel):
    """Structured so the UI can lay it out, rather than dumping a paragraph.

    Describes what the numbers say. Never recommends a trade — see the
    conventions in the engine's PLAN-BOT.md.
    """

    headline: str
    setup: str
    history_read: str
    watch_items: list[str] = []
    confidence: str = Field("low", description="low | medium | high")
    model: str | None = None


class TickerPage(BaseModel):
    ticker: str
    is_tracked: bool = Field(
        True, description="False = outside the universe; no signal track record exists"
    )

    as_of: datetime | None = None
    snapshot_age_hours: float | None = None
    is_stale: bool = False

    company_name: str | None = None
    company_domain: str | None = Field(None, description="for a logo lookup, e.g. 'walmart.com'")

    spot: float | None = None
    next_report_date: date | None = None
    next_report_session: str | None = None
    days_until_report: int | None = None

    direction: str | None = Field(
        None,
        description=(
            "BULLISH | BEARISH | NEUTRAL — the validated options-flow + sentiment lean for the "
            "*next* report, refined daily starting a few days out. Absent (not NEUTRAL) until "
            "that window opens; describes what the market's flow suggests, not a recommendation."
        ),
    )
    direction_confidence: float | None = Field(None, description="0-1")
    direction_as_of: date | None = Field(
        None, description="the date this read was last refreshed, for an age/freshness label"
    )

    options: OptionsPanel | None = None
    history: list[EarningsHistoryRow] = []
    stats: HistoryStats | None = None
    prices: list[PricePoint] = []

    news: list[NewsItem] | None = Field(
        None, description="null = fetch failed; [] = genuinely no news"
    )
    news_sentiment: float | None = Field(None, description="-1..1")
    analyst_score: float | None = Field(None, description="-1..1")
    analyst_rating_raw: float | None = Field(None, description="Seeking Alpha 1-5")

    fundamentals: Fundamentals | None = Field(
        None, description="null = the lookup failed or the symbol is unknown"
    )
    analyst_ratings: list[AnalystRatingRow] = Field(
        [], description="newest first; empty = no coverage or the lookup failed"
    )

    ai_summary: AiSummary | None = None


class CalendarEntry(BaseModel):
    ticker: str
    report_date: date
    session: str | None = None
    days_until: int
    verdict: str | None = None
    direction: str | None = None
    implied_move: float | None = None
    hist_avg_move: float | None = None
    edge_score: float | None = None
    spot: float | None = Field(None, description="current price, not point-in-time at report_date")


class CalendarPage(BaseModel):
    as_of: date
    window_days: int
    entries: list[CalendarEntry] = []


class PastEarningsRow(BaseModel):
    """One earnings event, any ticker — the cross-universe history feed.

    Distinct from EarningsHistoryRow (per-ticker, in TickerPage): same shape
    of fields, but this one carries `ticker` since it spans the whole
    universe.
    """

    ticker: str
    report_date: date
    session: str | None = None
    eps_estimate: float | None = None
    eps_actual: float | None = None
    eps_surprise: float | None = None
    implied_move: float | None = None
    verdict: str | None = None
    direction: str | None = None
    realized_move: float | None = None
    beat_implied: bool | None = None
    gap_open_pct: float | None = None
    gap_filled: bool | None = None
    vol_ratio: float | None = None
    pnl: float | None = None
    spot: float | None = Field(None, description="current price, not the price on report_date")


class PastEarningsPage(BaseModel):
    rows: list[PastEarningsRow] = []


class SignalRow(BaseModel):
    ticker: str
    run_date: date
    report_date: date
    workflow: str = Field(..., description='"A" = vol rich/cheap, "B" = directional')
    verdict: str | None = None
    direction: str | None = None
    implied_move: float | None = None
    edge_score: float | None = None
    confidence: float | None = None
    spot: float | None = Field(None, description="current price, not the price at run_date")
    beat_implied: bool | None = Field(
        None, description="null = event hasn't happened/been scored yet, not a miss"
    )
    correct_direction: bool | None = Field(
        None, description="null = event hasn't happened/been scored yet, not a miss"
    )


class SignalsPage(BaseModel):
    rows: list[SignalRow] = []


class TrackRecordPage(BaseModel):
    """Verdict accuracy and direction accuracy stay separate.

    They are two independent axes — "the market overpriced this move" and "the
    stock went up" are different claims. Collapsing them into one score would
    misrepresent what the engine actually predicts.
    """

    scored: int
    directional: int
    correct: int
    accuracy: float | None = None
    avg_long_straddle_pnl: float | None = None
    dir_scored: int = 0
    dir_correct: int = 0
    dir_accuracy: float | None = None


class TickerIndexEntry(BaseModel):
    ticker: str
    company_name: str | None = None
    company_domain: str | None = None
    next_report_date: date | None = None
    next_report_session: str | None = None
    verdict: str | None = None
    spot: float | None = None
    implied_move: float | None = None


class SiteIndex(BaseModel):
    """Everything the frontend needs to render search and build static routes."""

    generated_at: datetime
    tickers: list[TickerIndexEntry] = []
