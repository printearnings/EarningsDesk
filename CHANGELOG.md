# Changelog

Notable changes to EarningsDesk, kept succinct. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions follow
[SemVer](https://semver.org/) (`vMAJOR.MINOR.PATCH`). See
[README.md § Releases](./README.md#releases) for the tag/rollback convention.

## [Unreleased]

## [1.6.0] - 2026-08-16

### Added

- Options Simulator now runs inline on a ticker's own Options tab &mdash;
  "Simulate a trade" expands the builder in place instead of navigating to
  a now-removed `/t/[ticker]/simulator/` page.
- Simulator strike/current-price context: the "Build a trade" panel now
  names the ticker, and two new stat cards show the underlying's live price
  and the selected contract's live quoted price, separate from whatever
  hypothetical entry price is being modeled.
- Macro calendar: a "CPI, as released" table showing actual headline/core
  CPI prints (month-over-month and year-over-year), computed live from
  FRED's own series rather than a hand-maintained table.
- Calendar: mobile's day list now defaults to a rolling 14-day window
  instead of the whole month, with a "Show the full month" toggle.

### Fixed

- **Options Simulator strike/type mismatch**: the strike dropdown wasn't
  filtered by Call/Put, so picking a strike that only existed on the other
  side of the chain silently blanked the entire builder (no stats, no
  chart, no error). Wider strike ranges made this easy to hit. Now the
  dropdown only ever offers strikes that exist for the selected type.
- **Company logos broken CSP-wide**: Google's favicon endpoint
  (`www.google.com/s2/favicons`) redirects to `t{0-3}.gstatic.com`, which
  wasn't in `img-src` &mdash; every logo site-wide was silently falling back
  to a letter avatar. Added `https://*.gstatic.com`.
- **CPI table showing -100%**: FRED leaves not-yet-finalized months blank;
  `Number("")` evaluates to `0` in JS, so a blank month was read as an
  actual value and produced a fake -100% change. Blank fields are now
  skipped instead of parsed as zero.
- Options Simulator's strike bracket widened from the verdict engine's
  narrow &plusmn;15% (meant for ATM-only lookups) to &plusmn;60% for the
  simulator specifically &mdash; deep OTM and wide-strangle strikes were
  previously unreachable.
- Removed all remaining em dashes from user-facing copy site-wide.

### Changed

- Landing hero background: replaced the flickering-dot-grid animation with
  three large, softly blurred, slowly drifting glow blobs (quieter, less
  busy) and gave the hero a wavy bottom edge instead of a hard line into
  the page below.
- Calendar's "Today" button only shows once you've navigated away from the
  current month (relabeled "Jump to today") &mdash; it was previously
  always visible despite being a no-op most of the time, since the grid
  already opens on the current month by default.
- Footer is now centered instead of left-aligned.

## [1.5.0] - 2026-08-16

### Added

- Options Simulator no longer requires a confirmed earnings date &mdash; any
  ticker with a listed options chain (an ETF, a stock between earnings
  cycles, anything) now works as a plain Black-Scholes payoff calculator.
  Picking an untracked/cold ticker on the standalone Simulator page loads it
  inline instead of routing away to `/lookup/`.
- Financials panel's "no SEC data" empty state now links straight to that
  ticker's own EDGAR filings, instead of only explaining why the chart is
  empty.
- Landing page footer (Disclaimer/Privacy/Terms/FAQ links), previously only
  on dashboard-side pages.

### Changed

- Landing hero background: replaced the hand-drawn zigzag price-line texture
  with a proper flickering-dot-grid animation.
- FAQ page now has its own colored panel header, and the accordion rows tint
  navy when expanded instead of staying plain black-on-white.
- Removed remaining em dashes from Terms and Privacy page copy.

## [1.4.0] - 2026-08-16

### Added

- `robots.txt`, declaring an explicit Content Signals policy
  (`search=yes, ai-input=yes, ai-train=no`) &mdash; search and live
  AI-answer crawling allowed, AI training crawling disallowed. Previously no
  policy was declared at all.
- New Terms of Service page (`/terms/`), linked from the footer &mdash;
  scoped to what this site actually is (no accounts, no execution, no
  custody), not a broker-dealer template.
- Panel headers ("Next to report," "Track record," ...) now carry a diagonal
  navy wash instead of a plain white bar, so cards read as colored at a
  glance.
- The landing hero's flat color band now carries a slow, subtle drifting
  price-line texture instead of a static fill.
- The intraday price chart's hover tooltip now labels its time with the
  viewer's own local timezone abbreviation (e.g. PDT/EDT) &mdash; previously
  ambiguous whether a shown time was market time or local time.
- FAQ entries are now a collapsible accordion (native `<details>`, no JS) —
  question only until expanded, instead of nine always-open panels.

### Changed

- Dashboard panel action links ("Full calendar," "Detail," "All signals")
  are now visible bordered chips instead of plain underlined text.
- Sidebar/mobile nav: the catch-all "Others" and "Contact us" groups are now
  "More data" (Past earnings, Macro calendar) and "Help" (Methodology, FAQ,
  Support) &mdash; Methodology moved out of the data group since it's
  documentation, not a data page.
- Landing hero CTA copy: "Open the dashboard" &rarr; "Explore for free."
- Cookie banner: added a heading and relabeled the buttons ("Reject
  non-essential" / "Accept all"), keeping the copy honest about the single
  Cloudflare security cookie rather than borrowing generic
  tracking-cookie language.

## [1.3.0] - 2026-08-16

### Added

- Cookie consent banner (Accept/Reject), non-blocking. The only cookie this
  site sets is Cloudflare's own `cf_clearance` (bot/security mitigation,
  not tracking) — the standard "strictly necessary" exemption in
  cookie-consent law, so the choice doesn't disable anything today but is
  wired to gate anything non-essential added later.
- Copyright line in the footer.

### Fixed

- Dark mode: the gradient text on panel/page titles had a dark stop
  (`#16294f`) that measured 1.18:1 against the dark panel — effectively
  invisible. Replaced with a lighter gradient pair that clears 4.5:1 at
  both stops.

### Changed

- Privacy page now explicitly discloses `cf_clearance` and what it's for.
- Panel subtitles use a new solid `--color-brand-muted` color instead of
  gradient text — they're often full sentences, and a gradient reads worse
  the longer the string.

## [1.2.0] - 2026-08-16

### Added

- Standalone Simulator page now loads the trade builder inline for the
  picked ticker (auto-loading the chain) instead of navigating to that
  ticker's own /simulator/ sub-page and requiring a second click.
- New logo: a navy mark + wordmark, replacing the old plain-text-only
  lockup — sidebar, mobile nav, and a bigger version on the landing hero.

### Changed

- Brand color is navy again (a brief detour through a scoped
  Starbucks-inspired green palette didn't stick). Kept from that pass: the
  warm cream canvas, soft card shadows, full-pill CTA buttons.
- Page/panel titles now render as a navy gradient (bg-clip-text), every
  data table's header row carries a light navy wash, and the navy gradient
  is back on primary CTA buttons and the sidebar's active-page highlight —
  addressing "too much white" more directly than a background wash alone.
- Chart tooltips (price, simulator, financials, implied-vs-realized,
  open-interest) get a consistent header-row + separator treatment; a
  stray `shadow-sm` that had crept into three of them (this app doesn't
  use shadows for card depth) is gone.

## [1.1.0] - 2026-08-16

### Added

- Standalone Simulator page (new sidebar/nav entry) — pick any tracked
  ticker and land straight on its options P&L simulator, rather than only
  reaching it from a specific ticker's Options tab.

### Changed

- Options P&L simulator: fixed the expiry picker only showing ~2 months
  (the chain fetch now paginates with server-side strike filtering to reach
  every listed expiry); recolored the payoff chart red/loss vs green/profit
  with a clearer legend; raised the post-print IV assumption slider's ceiling
  past 100% to model IV expansion, not just crush; fixed a mobile layout
  overflow and added touch-drag support for the chart's hover tooltip.
- The "Simulate a trade" link on a ticker's Options tab is now a filled
  brand-gradient button instead of a small bordered text link.
- The "last updated" staleness warning now accounts for the nightly data
  job not running on weekends — a Sunday/Monday snapshot dated Friday no
  longer gets falsely flagged as a missed run.
- UI: a subtle brand-navy wash behind the page background and a 3px
  gradient hairline along the top edge of every panel/stat card, so the
  app reads less flat/white at a glance. No change to data colors.
- Fixed news thumbnails silently disappearing: the CSP's `img-src` didn't
  allow-list the Yahoo CDN hosts they're served from, so every thumbnail
  request was blocked and the component's error fallback hid it — added
  `s.yimg.com` and `media.zenfs.com`.

### Security

- The support form's destination inbox (`send_email` binding) moved out of
  the tracked `wrangler.jsonc` into `SUPPORT_DESTINATION_EMAIL`, filled in at
  deploy time by `scripts/gen-wrangler-config.mjs`. The real address no
  longer lives in source control.

## [1.0.0] - 2026-08-16

Baseline tag — first version-tracked release, cut at a working,
already-in-production state.

### Added

- Earnings-day options P&L simulator (single-leg, Black-Scholes repricing of
  a live chain).
- Insider Activity tab (SEC Form 4 transactions) on every ticker page.
- FOMC/CPI macro calendar page.
- Support/contact form with Turnstile spam protection, delivered through
  Cloudflare Email Routing.
- Navy/gradient UI refresh; softer corner radii; clearer chart grid and axis
  contrast; mobile touch support for the price chart's hover tooltip.

### Security

- HSTS, CSP, and other response security headers on both static pages and
  the API.
- DMARC tightened from `p=none` to `p=quarantine`.
