# Changelog

Notable changes to EarningsDesk, kept succinct. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions follow
[SemVer](https://semver.org/) (`vMAJOR.MINOR.PATCH`). See
[README.md § Releases](./README.md#releases) for the tag/rollback convention.

## [Unreleased]

### Changed

- Options P&L simulator: fixed the expiry picker only showing ~2 months
  (the chain fetch now paginates with server-side strike filtering to reach
  every listed expiry); recolored the payoff chart red/loss vs green/profit
  with a clearer legend; raised the post-print IV assumption slider's ceiling
  past 100% to model IV expansion, not just crush; fixed a mobile layout
  overflow and added touch-drag support for the chart's hover tooltip.

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
