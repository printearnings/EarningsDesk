# EarningsDesk

A retail-trader-facing web dashboard over the [Earnings](../Earnings/Earnings) signals
engine. Open a ticker before its print and see the price, the news, what options
volume is doing, what the last eight quarters actually did, and a plain-English read
on whether the market's pricing looks rich or cheap.

## Why it's shaped this way

**Live options data is metered.** A public dashboard cannot call Massive per page
view. So the heavy Python runs nightly in GitHub Actions, freezes each ticker's
picture into Postgres (`dashboard_snapshots`), and ships the result as static JSON.
The whole site is ~425 KB — Cloudflare serves it from cache, and a visitor costs
nothing.

**FastAPI can't run on Cloudflare Workers.** Pyodide has no `psycopg` driver and
can't load `yfinance`. The API here is therefore a *development* server and the
*generator* of the static payload — not a production service. Both paths call the
same functions in `api/app/services/pages.py`, so they can't drift.

**One Worker serves everything.** Static assets and the `/api/*` routes share a
Worker (`wrangler.jsonc`, `run_worker_first: ["/api/*"]`). Deploy with
`wrangler deploy` — *not* `wrangler pages deploy`, which Cloudflare's own migration
guide supersedes. Unifying them isn't only tidier than "Pages plus a separate API
Worker": the API is then **same-origin** with the page, so there are no CORS headers
to configure and no cross-origin path by which another site could fire
`/api/refresh` and burn the Massive quota.

```
Neon Postgres
     |
     |  nightly: earnings.workflows.build_dashboard  (metered — Massive, RapidAPI, LLM)
     v
dashboard_snapshots
     |
     |  api/app/dump_json.py   ->  web/public/data/*.json   (free)
     v
next build (output: "export")  ->  web/out
     |
     v
        one Cloudflare Worker
        ├── assets   web/out          every page, served from cache
        └── main     worker/src       /api/refresh, live + rate limited
```

## Layout

```
EarningsDesk/
├── api/                 FastAPI: dev server + static JSON generator
│   └── app/
│       ├── bootstrap.py   loads .env BEFORE earnings.config reads it (import order matters)
│       ├── schemas.py     Pydantic models — the single definition of the wire format
│       ├── services/      pages.py (engine -> schema mapping), quotes.py (price series)
│       ├── routers.py     HTTP routes, dev only
│       ├── dump_json.py   the production path
│       └── dump_openapi.py  feeds TypeScript type generation
└── web/                 Next.js 16, React 19, Tailwind 4, static export
    └── src/
        ├── styles/tokens.css   ** the only file a design-system swap touches **
        ├── lib/schema.d.ts     GENERATED from the Python models — do not edit
        ├── lib/api.ts          typed data access
        └── lib/format.ts       null renders as an em dash, never as zero
```

## Setup

Requires Python 3.11+, Node 20+, and the sibling `Earnings` repo checked out.

```bash
pip install -e ../Earnings/Earnings
pip install -e "api[dev]"
npm install --prefix web
```

Credentials: `api/app/bootstrap.py` finds `../Earnings/Earnings/.env` automatically.
To point elsewhere, copy `.env.example` to `.env` and set `EARNINGS_ENV_FILE`.
**Never copy secret values between files.**

Verify the wiring:

```bash
curl http://localhost:8000/healthz
```

It reports which env files loaded and which engine features are configured — the
most likely failure is a silently unloaded `.env`, which otherwise looks identical
to a healthy app until you request real data.

## Running

```bash
npm run gen:data --prefix web
```

Then start the frontend:

```bash
npm run dev --prefix web
```

For live DB reads instead of static files, run the API and set
`NEXT_PUBLIC_API_URL=http://localhost:8000`:

```bash
uvicorn app.main:app --reload --app-dir api
```

## Keeping types in sync

`web/src/lib/schema.d.ts` is generated from the Python Pydantic models. After
changing `api/app/schemas.py`:

```bash
npm run gen:types --prefix web
```

A renamed field then breaks `npm run typecheck` rather than rendering `undefined`.

## Checks

```bash
npm run typecheck --prefix web && npm run lint --prefix web && npm run test --prefix web
```

And on the Python side:

```bash
python -m pytest api/tests && python -m ruff check api/app api/tests
```

## Conventions that are load-bearing

These are not style preferences — breaking them misrepresents what the engine
predicts.

- **Verdict and direction are independent axes.** RICH/CHEAP describes *pricing*;
  BULLISH/BEARISH describes *movement*. RICH does not mean "sell". Never collapse
  them into one buy/sell score.
- **Null renders as an em dash, never as zero.** "We couldn't fetch the put/call
  ratio" and "the put/call ratio is 0.00" are opposite claims. `lib/format.ts`
  enforces this and has tests for it.
- **Hit rates are withheld below four scored events.** One correct call reads as
  100% accuracy, and that number gets screenshotted.
- **Cached pricing always carries its age.** A number without a timestamp invites
  someone to trade on it as if it were live.
- **Chart colors are validated, not chosen.** The implied/realized/price triple
  passes all six checks of the dataviz validator in both modes. Re-run it before
  changing any of them — the dark-mode lightness band is narrow and the obvious
  brighter picks fail it.
- **A page view must make zero metered API calls.** `api/tests/test_pages.py`
  asserts this by making `MassiveClient` and `SeekingAlphaClient` raise.

## Security posture

No cookies, no sessions, no auth — everything served is public read-only market
data, so there is nothing to authenticate and **no CSRF surface**. CORS runs with
`allow_credentials=False`.

If cookie-based sessions are ever added, CSRF protection becomes mandatory at the
same time.

The one endpoint that will need a guard is live refresh, because it spends metered
Massive calls. The control there is rate limiting plus requiring
`Content-Type: application/json` (which forces a CORS preflight the browser
blocks) — not identity.
