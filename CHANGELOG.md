# Changelog

Notable changes to EarningsDesk, kept succinct. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions follow
[SemVer](https://semver.org/) (`vMAJOR.MINOR.PATCH`). See
[README.md § Releases](./README.md#releases) for the tag/rollback convention.

## [Unreleased]

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
