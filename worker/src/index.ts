/**
 * EarningsDesk Worker.
 *
 * Serves the Next.js static export (via the assets binding) and handles the
 * one route that must be live: /api/refresh, which re-prices a ticker's ATM
 * straddle from Massive on demand.
 *
 * Why this route exists at all: every page on the site is served from a
 * nightly snapshot, which is what makes a visitor free. But an implied move
 * moves intraday, so a trader looking at a print tomorrow morning needs a way
 * to say "show me now". That click costs one metered Massive call, so it is
 * rate limited — see `checkRateLimit`.
 *
 * SECURITY POSTURE
 * ----------------
 * No cookies, no sessions, no auth. Everything served is public read-only
 * market data, so there is nothing to authenticate and no CSRF surface: CSRF
 * requires the browser to attach ambient credentials automatically, and there
 * are none.
 *
 * The real risk is quota theft — another site firing this endpoint to burn
 * Massive credits. Three things prevent it:
 *   1. Same origin. The static site and this API share a hostname, so no CORS
 *      headers are configured and cross-origin JS cannot read a response.
 *   2. `Content-Type: application/json` is required. A cross-origin POST with
 *      that header is not a "simple request", so the browser must preflight —
 *      and with no CORS headers, the preflight fails and the request is never
 *      sent.
 *   3. Per-IP hourly cap in KV.
 *
 * If cookie-based sessions are ever added, CSRF protection becomes mandatory
 * at the same time.
 */

import {
  putCallVolume,
  selectAtmStraddle,
  underlyingPrice,
  type RawContract,
} from "./straddle";

export interface Env {
  ASSETS: Fetcher;
  RATE_LIMIT: KVNamespace;
  MASSIVE_API_KEY: string;
  LIVE_REFRESH_PER_HOUR?: string;
}

const MASSIVE_BASE = "https://api.massive.com";
const YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const YAHOO_QUOTE_SUMMARY_BASE = "https://query1.finance.yahoo.com/v10/finance/quoteSummary";

/**
 * The only two ranges the intraday endpoint serves. Longer windows (1Y) are
 * daily closes and already ship in the nightly static payload — routing them
 * through here too would just be a slower path to data the page already has.
 */
const CHART_RANGES: Record<string, string> = {
  "1d": "5m",
  "5d": "15m",
};

const CHART_CACHE_SECONDS = 60;

/** Matches the engine's daily_radar.STRIKE_BRACKET. */
const STRIKE_BRACKET = 0.15;

const DEFAULT_LIMIT_PER_HOUR = 10;

function json(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // This is live, per-request data — never let a cache serve it as if it
      // were the nightly snapshot.
      "cache-control": "no-store",
      ...extra,
    },
  });
}

/**
 * Tickers are interpolated into an upstream URL, so validate strictly rather
 * than escaping. Uppercase letters only, at most six — which covers every
 * optionable US equity symbol and rejects anything path-like outright.
 */
function parseTicker(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim().toUpperCase();
  return /^[A-Z]{1,6}$/.test(t) ? t : null;
}

/** ISO date (YYYY-MM-DD), used as the earliest acceptable expiry. */
function parseDate(raw: string | null): string | null {
  if (!raw) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

/**
 * Fixed-window per-IP counter.
 *
 * A fixed window lets someone burst across a boundary — but the failure mode
 * here is a modest quota overspend, not a security breach, and a sliding
 * window would cost a KV write per request instead of one per window. The
 * cheaper mechanism is the right one for what's being protected.
 */
async function checkRateLimit(
  env: Env,
  ip: string,
): Promise<{ ok: boolean; remaining: number; limit: number }> {
  const limit = Number(env.LIVE_REFRESH_PER_HOUR ?? DEFAULT_LIMIT_PER_HOUR);
  const window = Math.floor(Date.now() / 3_600_000);
  const key = `refresh:${ip}:${window}`;

  const current = Number((await env.RATE_LIMIT.get(key)) ?? 0);
  if (current >= limit) return { ok: false, remaining: 0, limit };

  // Expire a little past the window so a clock skew can't leave it live.
  await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: 3900 });
  return { ok: true, remaining: limit - current - 1, limit };
}

async function handleRefresh(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Use POST." }, 405, { allow: "POST" });
  }

  // Required so a cross-origin call must preflight — see the security note.
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return json({ error: "Content-Type: application/json is required." }, 415);
  }

  if (!env.MASSIVE_API_KEY) {
    return json({ error: "Live refresh is not configured." }, 503);
  }

  const url = new URL(request.url);
  const ticker = parseTicker(url.searchParams.get("ticker"));
  if (!ticker) {
    return json({ error: "Missing or malformed `ticker`." }, 400);
  }

  // The engine measures the implied move from the first expiry that covers the
  // print, so the caller passes the report date. Falling back to today would
  // silently price the wrong week.
  const reportDate = parseDate(url.searchParams.get("report_date"));
  if (!reportDate) {
    return json({ error: "Missing or malformed `report_date` (YYYY-MM-DD)." }, 400);
  }

  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const limit = await checkRateLimit(env, ip);
  if (!limit.ok) {
    return json(
      {
        error: `Refresh limit reached (${limit.limit}/hour). The page data still updates nightly.`,
      },
      429,
      { "retry-after": "3600" },
    );
  }

  let results: RawContract[];
  try {
    results = await fetchChain(env, ticker, reportDate);
  } catch (err) {
    // Never surface the upstream error verbatim — it carries the API key in
    // the request URL.
    console.error("massive fetch failed", { ticker, err: String(err) });
    return json({ error: "Couldn't reach the options data provider." }, 502);
  }

  const spot = underlyingPrice(results);
  if (spot === null) {
    return json({ error: `No live chain available for ${ticker}.` }, 404);
  }

  const straddle = selectAtmStraddle(results, spot, reportDate);
  const { ratio } = putCallVolume(results);

  return json(
    {
      ticker,
      as_of: new Date().toISOString(),
      spot,
      implied_move: straddle?.impliedMove ?? null,
      atm_strike: straddle?.strike ?? null,
      atm_expiry: straddle?.expiry ?? null,
      straddle_price: straddle?.straddle ?? null,
      put_call_ratio: ratio,
    },
    200,
    { "x-ratelimit-remaining": String(limit.remaining) },
  );
}

export interface ChartPoint {
  t: string; // ISO timestamp
  close: number;
}

export interface ChartResponse {
  ticker: string;
  range: string;
  interval: string;
  currency: string | null;
  regular_market_price: number | null;
  previous_close: number | null;
  points: ChartPoint[];
}

/**
 * Intraday price series, proxied from Yahoo's public chart endpoint.
 *
 * This is NOT Massive — it's free, unauthenticated, and unrelated to the
 * metered options data, so it deliberately bypasses the rate limiter that
 * guards /api/refresh. What protects it instead is the edge cache: every
 * viewer of one ticker within the same 60s window shares a single upstream
 * fetch, via Cloudflare's `caches.default` keyed on the request URL.
 */
async function handleChart(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const ticker = parseTicker(url.searchParams.get("ticker"));
  const range = url.searchParams.get("range") ?? "1d";
  const interval = CHART_RANGES[range];

  if (!ticker) return json({ error: "Missing or malformed `ticker`." }, 400);
  if (!interval) {
    return json(
      { error: `Unsupported range. Use one of: ${Object.keys(CHART_RANGES).join(", ")}.` },
      400,
    );
  }

  const cache = caches.default;
  // Cache key ignores query param order and any client-added params — only
  // ticker+range identify the response.
  const cacheKey = new Request(
    `https://cache.internal/chart/${ticker}/${range}`,
    { method: "GET" },
  );

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const upstream = new URL(`${YAHOO_CHART_BASE}/${ticker}`);
  upstream.searchParams.set("range", range);
  upstream.searchParams.set("interval", interval);

  let body: {
    chart?: {
      result?: Array<{
        meta?: {
          currency?: string;
          regularMarketPrice?: number;
          chartPreviousClose?: number;
        };
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: (number | null)[] }> };
      }>;
    };
  };

  try {
    const res = await fetch(upstream.toString(), {
      headers: { "user-agent": "Mozilla/5.0 (compatible; EarningsDeskBot/1.0)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    body = await res.json();
  } catch (err) {
    console.error("chart fetch failed", { ticker, range, err: String(err) });
    return json({ error: `Couldn't reach the price data provider for ${ticker}.` }, 502);
  }

  const result = body.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];

  const points: ChartPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    // Yahoo pads pre/post-market gaps with null closes rather than omitting
    // the bar — drop those rather than plotting a fake zero.
    if (typeof close !== "number") continue;
    points.push({ t: new Date(timestamps[i] * 1000).toISOString(), close });
  }

  const payload: ChartResponse = {
    ticker,
    range,
    interval,
    currency: result?.meta?.currency ?? null,
    regular_market_price: result?.meta?.regularMarketPrice ?? null,
    previous_close: result?.meta?.chartPreviousClose ?? null,
    points,
  };

  const response = json(payload, 200, {
    // Public + max-age lets shared/browser caches reuse it too, not just the
    // Cloudflare edge cache below.
    "cache-control": `public, max-age=${CHART_CACHE_SECONDS}`,
  });

  // Store a clone — the original body has already been consumed by the caller.
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

export interface LookupResponse {
  ticker: string;
  found: boolean;
  spot: number | null;
  previous_close: number | null;
  company_name: string | null;
  next_report_date: string | null; // ISO date, best-effort
}

const LOOKUP_CACHE_SECONDS = 300;

/**
 * Free, unrestricted "is this a real ticker, and roughly what does it look
 * like" lookup — the search box's answer to "search should work for any
 * stock, not just the tracked universe."
 *
 * Deliberately NOT gated by the tracked-universe index or the rate limiter
 * that guards /api/refresh: this costs Yahoo's free endpoints, not Massive,
 * so there's no metered quota to protect. It's still edge-cached, because a
 * popular untracked symbol shouldn't mean a fresh upstream call per visitor.
 *
 * Does not return options data — that requires the metered chain fetch and
 * the historical scoring only the tracked universe has. A cold lookup is
 * honestly a smaller page than a tracked one; see web/src/app/(app)/lookup.
 */
async function handleLookup(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const ticker = parseTicker(url.searchParams.get("ticker"));
  if (!ticker) return json({ error: "Missing or malformed `ticker`." }, 400);

  const cache = caches.default;
  const cacheKey = new Request(`https://cache.internal/lookup/${ticker}`, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const [chart, calendar] = await Promise.all([
    fetchYahooChartMeta(ticker),
    fetchYahooCalendarEvents(ticker),
  ]);

  // Neither call resolving to anything usable means the symbol doesn't exist
  // (or Yahoo has nothing on it) — that's a normal, expected outcome for a
  // search box open to arbitrary input, not a server error.
  const payload: LookupResponse = {
    ticker,
    found: chart !== null,
    spot: chart?.regularMarketPrice ?? null,
    previous_close: chart?.chartPreviousClose ?? null,
    company_name: chart?.shortName ?? null,
    next_report_date: calendar,
  };

  const response = json(payload, 200, {
    "cache-control": `public, max-age=${LOOKUP_CACHE_SECONDS}`,
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

async function fetchYahooChartMeta(ticker: string): Promise<{
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  shortName?: string;
} | null> {
  try {
    const res = await fetch(`${YAHOO_CHART_BASE}/${ticker}?range=1d&interval=1d`, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; EarningsDeskBot/1.0)" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      chart?: { result?: Array<{ meta?: Record<string, unknown> }> };
    };
    const meta = body.chart?.result?.[0]?.meta;
    return meta && Object.keys(meta).length > 0 ? meta : null;
  } catch {
    return null;
  }
}

/** Best-effort next earnings date. Yahoo's calendarEvents module is not
 * always populated; a miss here just means next_report_date stays null —
 * never a reason to fail the whole lookup. */
async function fetchYahooCalendarEvents(ticker: string): Promise<string | null> {
  try {
    const url = `${YAHOO_QUOTE_SUMMARY_BASE}/${ticker}?modules=calendarEvents`;
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; EarningsDeskBot/1.0)" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      quoteSummary?: {
        result?: Array<{
          calendarEvents?: { earnings?: { earningsDate?: Array<{ raw?: number }> } };
        }>;
      };
    };
    const raw = body.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate?.[0]?.raw;
    return typeof raw === "number" ? new Date(raw * 1000).toISOString().slice(0, 10) : null;
  } catch {
    return null;
  }
}

async function fetchChain(
  env: Env,
  ticker: string,
  reportDate: string,
): Promise<RawContract[]> {
  const url = new URL(`${MASSIVE_BASE}/v3/snapshot/options/${ticker}`);
  url.searchParams.set("expiration_date.gte", reportDate);
  url.searchParams.set("limit", "250");
  url.searchParams.set("sort", "expiration_date");
  url.searchParams.set("order", "asc");
  url.searchParams.set("apiKey", env.MASSIVE_API_KEY);

  const res = await fetch(url.toString(), {
    // A hung upstream must not hold a Worker request open indefinitely.
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);

  const body = (await res.json()) as { results?: RawContract[] };
  const results = body.results ?? [];

  // The strike bracket is applied here rather than upstream because the spot
  // isn't known until the response arrives. Narrowing keeps the ATM search
  // honest on names with hundreds of listed strikes.
  const spot = underlyingPrice(results);
  if (spot === null) return results;

  const lo = spot * (1 - STRIKE_BRACKET);
  const hi = spot * (1 + STRIKE_BRACKET);
  return results.filter((r) => {
    const k = r.details?.strike_price;
    return typeof k === "number" && k >= lo && k <= hi;
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/refresh") {
      return handleRefresh(request, env);
    }

    if (url.pathname === "/api/chart") {
      return handleChart(request, env, ctx);
    }

    if (url.pathname === "/api/lookup") {
      return handleLookup(request, env, ctx);
    }

    if (url.pathname === "/api/health") {
      return json({ status: "ok", live_refresh: Boolean(env.MASSIVE_API_KEY) });
    }

    // `run_worker_first` only routes /api/*, so anything else arriving here is
    // an unknown API path. Hand the rest back to static assets so the 404 page
    // renders rather than a bare JSON error.
    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Unknown endpoint." }, 404);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
