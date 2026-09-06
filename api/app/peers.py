"""Who counts as a "peer" for the peers panel.

Hybrid resolution, in priority order:

1. A hand-curated list of similar-*product* competitors (CURATED). This is the
   part sector grouping can't do — NVDA's peers are other chipmakers, not every
   name Yahoo files under "Technology". Curated only for the names where the
   cohort is obvious and stable; everything else falls through to:
2. Same-sector tracked names, as a zero-maintenance backstop so a name without
   a curated list still shows *something* relevant.

Resolution is pure and index-driven: the caller passes a snapshot of the
universe (ticker -> PeerRecord) and this module never touches the DB or the
network, so it's cheap to test and can't drift from the data the page renders.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.schemas import PeerEarnings

# Curated similar-product cohorts. A ticker maps to the names a reader would
# recognise as its direct competitors — deliberately short, not an index
# membership list. Symmetry isn't required (AMD lists NVDA and vice-versa only
# where both are genuinely peers). Uppercase keys and values; resolution
# upper-cases the query.
CURATED: dict[str, tuple[str, ...]] = {
    # Semiconductors
    "NVDA": ("AMD", "AVGO", "TSM", "INTC", "QCOM", "MU"),
    "AMD": ("NVDA", "INTC", "AVGO", "QCOM", "TSM"),
    "INTC": ("AMD", "NVDA", "TSM", "MU", "QCOM"),
    "AVGO": ("NVDA", "QCOM", "TXN", "MRVL", "AMD"),
    "QCOM": ("AVGO", "NVDA", "MRVL", "TXN", "AMD"),
    "MU": ("NVDA", "TSM", "INTC", "AMD"),
    "TSM": ("NVDA", "INTC", "AMD", "MU"),
    "MRVL": ("AVGO", "QCOM", "NVDA", "AMD"),
    "TXN": ("AVGO", "QCOM", "MRVL", "ADI"),
    # Mega-cap software / internet
    "MSFT": ("GOOGL", "AAPL", "AMZN", "ORCL", "CRM"),
    "GOOGL": ("META", "MSFT", "AMZN", "AAPL"),
    "META": ("GOOGL", "SNAP", "PINS", "AMZN"),
    "AMZN": ("MSFT", "GOOGL", "WMT", "AAPL"),
    "AAPL": ("MSFT", "GOOGL", "AMZN"),
    "ORCL": ("MSFT", "CRM", "SAP", "ADBE"),
    "CRM": ("ORCL", "MSFT", "ADBE", "NOW"),
    "ADBE": ("CRM", "MSFT", "ORCL", "NOW"),
    "NOW": ("CRM", "ADBE", "ORCL"),
    "PLTR": ("SNOW", "AI", "NOW"),
    # Streaming / media
    "NFLX": ("DIS", "WBD", "PARA", "CMCSA"),
    "DIS": ("NFLX", "CMCSA", "WBD", "PARA"),
    # Retail
    "WMT": ("TGT", "COST", "AMZN", "KR"),
    "TGT": ("WMT", "COST", "KR", "DG"),
    "COST": ("WMT", "TGT", "BJ", "KR"),
    "HD": ("LOW",),
    "LOW": ("HD",),
    # Payments / fintech
    "V": ("MA", "AXP", "PYPL"),
    "MA": ("V", "AXP", "PYPL"),
    "PYPL": ("V", "MA", "SQ", "COIN"),
    "COIN": ("PYPL", "SQ", "HOOD"),
    # Big banks
    "JPM": ("BAC", "WFC", "C", "GS", "MS"),
    "BAC": ("JPM", "WFC", "C", "GS"),
    "GS": ("MS", "JPM", "BAC", "C"),
    # Autos / EV
    "TSLA": ("GM", "F", "RIVN", "LCID"),
    "GM": ("F", "TSLA", "STLA"),
    "F": ("GM", "TSLA", "STLA"),
    # Beverages / staples
    "KO": ("PEP", "MNST", "KDP"),
    "PEP": ("KO", "MNST", "KDP"),
    # Restaurants
    "MCD": ("SBUX", "YUM", "CMG"),
    "SBUX": ("MCD", "CMG", "YUM"),
    # Rideshare / delivery
    "UBER": ("LYFT", "DASH", "ABNB"),
    # Streaming hardware / networking
    "CSCO": ("ANET", "JNPR", "AVGO"),
}

# A peers panel with one lonely card reads as broken more than as informative;
# below this many resolved peers with usable data, show nothing.
MIN_PEERS = 2
# Above this, the panel gets noisy and the tail peers are the least relevant.
MAX_PEERS = 6


@dataclass(frozen=True)
class PeerRecord:
    """One universe name's peer-relevant snapshot fields. `last_earnings` is
    None until that name's most recent print has happened and priced."""

    ticker: str
    company_name: str | None
    company_domain: str | None
    sector: str | None
    last_earnings: PeerEarnings | None


def resolve_peers(
    ticker: str,
    index: dict[str, PeerRecord],
    *,
    limit: int = MAX_PEERS,
) -> list[PeerEarnings]:
    """The peer earnings cards for `ticker`, curated-first then sector fallback.

    Only peers that actually carry `last_earnings` are returned — a peer with no
    recent-earnings data contributes nothing to a "how did the cohort's prints
    go" panel. Returns [] below MIN_PEERS so the caller can drop the panel
    entirely rather than render a stub.

    Curated peers come first. When too few of them have usable data to fill a
    panel (e.g. only one of a name's curated cohort is in the current reporting
    window), the sector fallback tops the list up rather than the panel
    vanishing — a single lonely curated peer is worse than curated-plus-a-few
    same-sector names.
    """
    ticker = ticker.upper()
    self_rec = index.get(ticker)

    # Curated peers that actually carry recent-earnings data, in curated order.
    ordered = [t for t in _curated_order(ticker, index) if index[t].last_earnings is not None]

    # Top up (or, with no curated cohort, fill) from same-sector names until the
    # panel is worth showing. _sector_order already filters to last_earnings.
    if len(ordered) < MIN_PEERS:
        seen = set(ordered)
        sector = self_rec.sector if self_rec else None
        ordered += [t for t in _sector_order(ticker, sector, index) if t not in seen]

    if len(ordered) < MIN_PEERS:
        return []
    return [index[t].last_earnings for t in ordered[:limit]]


def _curated_order(ticker: str, index: dict[str, PeerRecord]) -> list[str]:
    """Curated peers that exist in the universe, in their curated order."""
    return [p for p in CURATED.get(ticker, ()) if p != ticker and p in index]


def _sector_order(ticker: str, sector: str | None, index: dict[str, PeerRecord]) -> list[str]:
    """Same-sector tracked names, most-recent print first — the fallback when a
    name has no curated cohort. Ordering by report recency puts the freshest,
    most-relevant reactions at the front."""
    if not sector:
        return []
    mates = [
        rec
        for t, rec in index.items()
        if t != ticker and rec.sector == sector and rec.last_earnings is not None
    ]
    mates.sort(key=lambda r: r.last_earnings.report_date, reverse=True)
    return [r.ticker for r in mates]
