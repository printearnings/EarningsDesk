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
 *
 * SCALE
 * -----
 * Every Massive-touching route also carries a GLOBAL hourly cap (site-wide,
 * not per-IP) — see `checkGlobalRateLimit`. Per-IP limits only bound what one
 * visitor can do; they do nothing against many different concurrent visitors,
 * which is the normal case for /api/chart and /api/indicators (both fire
 * automatically on every ticker page view, not from a deliberate click). The
 * global cap is a circuit breaker on total metered spend during a real
 * traffic spike, sized generously so it never fires under ordinary use.
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
  SUPPORT_EMAIL: SendEmail;
  TURNSTILE_SECRET_KEY?: string;
  LIVE_REFRESH_PER_HOUR?: string;
  SEARCH_PER_HOUR?: string;
  SUPPORT_PER_HOUR?: string;
  CHAIN_PER_HOUR?: string;
  GLOBAL_REFRESH_PER_HOUR?: string;
  GLOBAL_SEARCH_PER_HOUR?: string;
  GLOBAL_CHART_PER_HOUR?: string;
  GLOBAL_INDICATORS_PER_HOUR?: string;
  GLOBAL_FINANCIALS_PER_HOUR?: string;
  GLOBAL_SUPPORT_PER_HOUR?: string;
  GLOBAL_CHAIN_PER_HOUR?: string;
  GLOBAL_INSIDERS_PER_HOUR?: string;
}

const MASSIVE_BASE = "https://api.massive.com";
const YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const YAHOO_QUOTE_SUMMARY_BASE =
  "https://query1.finance.yahoo.com/v10/finance/quoteSummary";

const CHART_CACHE_SECONDS = 60;

/** Matches the engine's daily_radar.STRIKE_BRACKET. Used for the narrow,
 * ATM-only lookup (/api/refresh's straddle selection). */
const STRIKE_BRACKET = 0.15;
/** The simulator (/api/chain, fullDepth) wants strikes a trader would
 * actually consider, not just the ATM neighborhood the verdict engine cares
 * about — deep OTM lottery plays and wide strangles both live well outside
 * ±15%. ±60% comfortably covers those without fetching the entire chain. */
const SIMULATOR_STRIKE_BRACKET = 0.6;

const DEFAULT_LIMIT_PER_HOUR = 10;
const DEFAULT_SEARCH_PER_HOUR = 60;
const DEFAULT_SUPPORT_PER_HOUR = 5;
const DEFAULT_CHAIN_PER_HOUR = 10;

// Global (site-wide) circuit breakers, one per Massive-touching route. Sized
// well above realistic peak traffic for a site this size — the point is to
// bound worst-case spend under a genuine spike or bug, not to throttle normal
// use. /api/chart and /api/indicators get the highest ceilings because they
// fire on every ticker page view, not from a deliberate click.
const DEFAULT_GLOBAL_REFRESH_PER_HOUR = 300;
const DEFAULT_GLOBAL_SEARCH_PER_HOUR = 5000;
const DEFAULT_GLOBAL_CHART_PER_HOUR = 3000;
const DEFAULT_GLOBAL_INDICATORS_PER_HOUR = 1500;
const DEFAULT_GLOBAL_FINANCIALS_PER_HOUR = 1000;
// Deliberately tight — this is the one route that sends a real email rather
// than reading market data, so its ceiling protects an inbox from spam, not
// a Massive budget.
const DEFAULT_GLOBAL_SUPPORT_PER_HOUR = 50;
// Same Massive endpoint /api/refresh already hits (v3/snapshot/options), so
// the same ceiling makes sense — this isn't a heavier call, just a richer
// response shape (the full bracketed chain instead of one straddle).
const DEFAULT_GLOBAL_CHAIN_PER_HOUR = 300;
// Cached for hours (see INSIDERS_CACHE_SECONDS below), so this only bounds
// cache-miss traffic across many different tickers at once, not per-ticker
// repeat views.
const DEFAULT_GLOBAL_INSIDERS_PER_HOUR = 1000;

// /api/* bypasses static-asset serving entirely (run_worker_first), so the
// _headers file in web/public — which carries HSTS/CSP/etc. for every page —
// never applies here. Mirror the baseline headers that still make sense for
// a JSON response; CSP itself is a no-op on non-HTML responses, so it's not
// worth carrying here.
const API_SECURITY_HEADERS: HeadersInit = {
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

function json(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // This is live, per-request data — never let a cache serve it as if it
      // were the nightly snapshot.
      "cache-control": "no-store",
      ...API_SECURITY_HEADERS,
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

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
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
  {
    kind = "refresh",
    limit: limitOverride,
  }: { kind?: string; limit?: number } = {},
): Promise<{ ok: boolean; remaining: number; limit: number }> {
  const limit =
    limitOverride ??
    Number(env.LIVE_REFRESH_PER_HOUR ?? DEFAULT_LIMIT_PER_HOUR);
  const window = Math.floor(Date.now() / 3_600_000);
  const key = `${kind}:${ip}:${window}`;

  const current = Number((await env.RATE_LIMIT.get(key)) ?? 0);
  if (current >= limit) return { ok: false, remaining: 0, limit };

  // Expire a little past the window so a clock skew can't leave it live.
  await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: 3900 });
  return { ok: true, remaining: limit - current - 1, limit };
}

/**
 * Same fixed-window mechanism as `checkRateLimit`, but keyed WITHOUT an IP —
 * a shared counter across every visitor. Per-IP limits protect against one
 * abusive visitor; they do nothing when the load is many different visitors
 * at once, which is ordinary traffic for a page-view-triggered route like
 * /api/chart. This is that missing backstop.
 */
export async function checkGlobalRateLimit(
  env: Env,
  kind: string,
  limit: number,
): Promise<{ ok: boolean; remaining: number; limit: number }> {
  const window = Math.floor(Date.now() / 3_600_000);
  const key = `global:${kind}:${window}`;

  const current = Number((await env.RATE_LIMIT.get(key)) ?? 0);
  if (current >= limit) return { ok: false, remaining: 0, limit };

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
    return json(
      { error: "Missing or malformed `report_date` (YYYY-MM-DD)." },
      400,
    );
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

  const globalLimit = await checkGlobalRateLimit(
    env,
    "refresh",
    Number(env.GLOBAL_REFRESH_PER_HOUR ?? DEFAULT_GLOBAL_REFRESH_PER_HOUR),
  );
  if (!globalLimit.ok) {
    return json(
      {
        error:
          "Refresh is at capacity site-wide right now. The page data still updates nightly.",
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

export interface ChainContract {
  strike: number;
  expiry: string;
  type: "call" | "put";
  price: number | null;
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  open_interest: number | null;
}

/**
 * The options P&L simulator's data source — the same Massive chain
 * `fetchChain` already pulls for /api/refresh, but returned per-contract
 * (strike/expiry/type/price/IV/greeks) instead of collapsed down to one ATM
 * straddle. Greeks come straight off Massive's response; nothing here
 * derives them (no Black-Scholes on this side — that lives client-side in
 * blackScholes.ts, for repricing at a hypothetical spot/IV/date the API was
 * never asked about).
 */
async function handleChain(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Use POST." }, 405, { allow: "POST" });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return json({ error: "Content-Type: application/json is required." }, 415);
  }

  if (!env.MASSIVE_API_KEY) {
    return json({ error: "Live chain is not configured." }, 503);
  }

  const url = new URL(request.url);
  const ticker = parseTicker(url.searchParams.get("ticker"));
  if (!ticker) {
    return json({ error: "Missing or malformed `ticker`." }, 400);
  }
  const reportDate = parseDate(url.searchParams.get("report_date"));
  if (!reportDate) {
    return json(
      { error: "Missing or malformed `report_date` (YYYY-MM-DD)." },
      400,
    );
  }

  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const limit = await checkRateLimit(env, ip, {
    kind: "chain",
    limit: Number(env.CHAIN_PER_HOUR ?? DEFAULT_CHAIN_PER_HOUR),
  });
  if (!limit.ok) {
    return json(
      {
        error: `Chain-load limit reached (${limit.limit}/hour). Try again later.`,
      },
      429,
      { "retry-after": "3600" },
    );
  }

  const globalLimit = await checkGlobalRateLimit(
    env,
    "chain",
    Number(env.GLOBAL_CHAIN_PER_HOUR ?? DEFAULT_GLOBAL_CHAIN_PER_HOUR),
  );
  if (!globalLimit.ok) {
    return json(
      { error: "The chain loader is at capacity site-wide right now." },
      429,
      { "retry-after": "3600" },
    );
  }

  let results: RawContract[];
  try {
    results = await fetchChain(env, ticker, reportDate, { fullDepth: true });
  } catch (err) {
    console.error("massive fetch failed", { ticker, err: String(err) });
    return json({ error: "Couldn't reach the options data provider." }, 502);
  }

  const spot = underlyingPrice(results);
  if (spot === null) {
    return json({ error: `No live chain available for ${ticker}.` }, 404);
  }

  const contracts: ChainContract[] = [];
  for (const c of results) {
    const strike = c.details?.strike_price;
    const expiry = c.details?.expiration_date;
    const type = c.details?.contract_type;
    if (
      typeof strike !== "number" ||
      !expiry ||
      (type !== "call" && type !== "put")
    )
      continue;

    contracts.push({
      strike,
      expiry,
      type,
      price: c.last_trade?.price ?? c.day?.close ?? null,
      iv: c.implied_volatility ?? null,
      delta: c.greeks?.delta ?? null,
      gamma: c.greeks?.gamma ?? null,
      theta: c.greeks?.theta ?? null,
      vega: c.greeks?.vega ?? null,
      open_interest: c.open_interest ?? null,
    });
  }

  return json(
    { ticker, as_of: new Date().toISOString(), spot, contracts },
    200,
    { "x-ratelimit-remaining": String(limit.remaining) },
  );
}

const SUPPORT_CATEGORIES = ["feedback", "bug"] as const;
type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];
const SUPPORT_CATEGORY_LABEL: Record<SupportCategory, string> = {
  feedback: "Feedback",
  bug: "Bug report",
};

const SUPPORT_MAX_SUBJECT = 200;
const SUPPORT_MAX_DESCRIPTION = 5000;
const SUPPORT_FROM_ADDRESS = "support@printearnings.com";
// Fixed at deploy time via the `send_email` binding's own `destination_address`
// (wrangler.jsonc) — the binding refuses to send anywhere else, so this only
// needs to match that value, never come from the request.
const SUPPORT_TO_ADDRESS = "patrickkhai98@gmail.com";

/**
 * The rate limits alone only cap *volume* from a script hitting this route —
 * they don't stop a script from hitting it at all, since CORS/content-type
 * checks are enforced by browsers, not by a curl call that sets its own
 * headers. Turnstile is the actual bot filter; this verifies the token
 * server-side the same way Cloudflare's own docs describe.
 */
async function verifyTurnstile(
  env: Env,
  token: string,
  ip: string,
): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return false;
  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: token,
    remoteip: ip,
  });
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body,
        signal: AbortSignal.timeout(10_000),
      },
    );
    const result = (await res.json()) as { success?: boolean };
    return result.success === true;
  } catch (err) {
    console.error("turnstile verify failed", { err: String(err) });
    return false;
  }
}

/**
 * The support form's only server-side job: validate, rate-limit, and hand
 * off to Email Routing's `send_email` binding — no database, no queue,
 * nothing to poll. That binding is what keeps the real inbox address out of
 * both the page source and the browser network tab: the client only ever
 * sees this Worker route, never an address to mail directly.
 */
async function handleSupport(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Use POST." }, 405, { allow: "POST" });
  }

  // Same CSRF posture as /api/refresh — see the file header.
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return json({ error: "Content-Type: application/json is required." }, 415);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Malformed JSON body." }, 400);
  }
  const { category, subject, description, page, turnstileToken } = (body ??
    {}) as Record<string, unknown>;

  if (
    typeof category !== "string" ||
    !SUPPORT_CATEGORIES.includes(category as SupportCategory)
  ) {
    return json({ error: '`category` must be "feedback" or "bug".' }, 400);
  }
  const subjectText = typeof subject === "string" ? subject.trim() : "";
  if (!subjectText || subjectText.length > SUPPORT_MAX_SUBJECT) {
    return json(
      { error: `\`subject\` is required (max ${SUPPORT_MAX_SUBJECT} chars).` },
      400,
    );
  }
  const descriptionText =
    typeof description === "string" ? description.trim() : "";
  if (!descriptionText || descriptionText.length > SUPPORT_MAX_DESCRIPTION) {
    return json(
      {
        error: `\`description\` is required (max ${SUPPORT_MAX_DESCRIPTION} chars).`,
      },
      400,
    );
  }
  // Free-text context only, never trusted as a real URL — just interpolated
  // into the email body for "what page were they on".
  const pageText = typeof page === "string" ? page.trim().slice(0, 300) : "";
  if (typeof turnstileToken !== "string" || !turnstileToken) {
    return json(
      { error: "Verification failed. Reload the page and try again." },
      400,
    );
  }

  if (!env.SUPPORT_EMAIL) {
    return json({ error: "Support form is not configured." }, 503);
  }

  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const limit = await checkRateLimit(env, ip, {
    kind: "support",
    limit: Number(env.SUPPORT_PER_HOUR ?? DEFAULT_SUPPORT_PER_HOUR),
  });
  if (!limit.ok) {
    return json(
      { error: `Too many submissions (${limit.limit}/hour). Try again later.` },
      429,
      {
        "retry-after": "3600",
      },
    );
  }

  const globalLimit = await checkGlobalRateLimit(
    env,
    "support",
    Number(env.GLOBAL_SUPPORT_PER_HOUR ?? DEFAULT_GLOBAL_SUPPORT_PER_HOUR),
  );
  if (!globalLimit.ok) {
    return json(
      { error: "The support form is at capacity site-wide right now." },
      429,
      {
        "retry-after": "3600",
      },
    );
  }

  if (!(await verifyTurnstile(env, turnstileToken, ip))) {
    return json(
      { error: "Verification failed. Reload the page and try again." },
      400,
    );
  }

  try {
    const { createMimeMessage } = await import("mimetext");
    const { EmailMessage } = await import("cloudflare:email");

    const msg = createMimeMessage();
    msg.setSender({
      name: "PrintEarnings Support",
      addr: SUPPORT_FROM_ADDRESS,
    });
    msg.setRecipient(SUPPORT_TO_ADDRESS);
    msg.setSubject(
      `[${SUPPORT_CATEGORY_LABEL[category as SupportCategory]}] ${subjectText}`,
    );
    const headerLines = [
      `Category: ${SUPPORT_CATEGORY_LABEL[category as SupportCategory]}`,
    ];
    if (pageText) headerLines.push(`Page: ${pageText}`);

    msg.addMessage({
      contentType: "text/plain",
      data: [...headerLines, "", descriptionText].join("\n"),
    });

    const message = new EmailMessage(
      SUPPORT_FROM_ADDRESS,
      SUPPORT_TO_ADDRESS,
      msg.asRaw(),
    );
    await env.SUPPORT_EMAIL.send(message);
  } catch (err) {
    console.error("support email failed", { err: String(err) });
    return json(
      { error: "Couldn't send that right now. Try again shortly." },
      502,
    );
  }

  return json({ ok: true }, 200, {
    "x-ratelimit-remaining": String(limit.remaining),
  });
}

export interface ChartPoint {
  t: string; // ISO timestamp
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
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

/** "YYYY-MM-DD" in US market time — the aggs endpoint's `from`/`to` are ET
 * calendar dates, and a UTC-local `toISOString().slice(0,10)` would read as
 * tomorrow for anyone west of Greenwich after 8pm ET. */
function etDateString(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

const MASSIVE_AGGS_LIMIT = 5000; // comfortably above a day's worth of 1m bars (~390).

interface MassiveAggBar {
  t: number; // epoch ms
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v?: number; // volume — absent on some sparse/OTC bars, never assume present
}

async function fetchMassiveAggs(
  env: Env,
  ticker: string,
  multiplier: number,
  timespan: "minute" | "day",
  from: string,
  to: string,
): Promise<MassiveAggBar[]> {
  const url = new URL(
    `${MASSIVE_BASE}/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}`,
  );
  url.searchParams.set("adjusted", "true");
  url.searchParams.set("sort", "asc");
  url.searchParams.set("limit", String(MASSIVE_AGGS_LIMIT));
  url.searchParams.set("apiKey", env.MASSIVE_API_KEY);

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const body = (await res.json()) as { results?: MassiveAggBar[] };
  return body.results ?? [];
}

async function fetchMassivePrevClose(
  env: Env,
  ticker: string,
): Promise<number | null> {
  try {
    const url = new URL(`${MASSIVE_BASE}/v2/aggs/ticker/${ticker}/prev`);
    url.searchParams.set("apiKey", env.MASSIVE_API_KEY);
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { results?: Array<{ c?: number }> };
    return body.results?.[0]?.c ?? null;
  } catch {
    return null;
  }
}

/** How many calendar days of buffer to request so weekends/holidays don't
 * leave a range short of its labeled trading-day count. "1d" needs more than
 * a bare 1-day margin: a 1-day buffer only reaches back across a weekend when
 * "now" happens to be Saturday. On Sunday (or the day after a holiday that
 * follows a weekend) it lands on another non-trading day and comes back
 * empty — not because there's no recent session, just because the window
 * didn't reach it. 4 days reaches the prior trading day from any day of the
 * week; the trim-to-latest-trading-day logic below still shows only one. */
const RANGE_LOOKBACK_DAYS: Record<string, number> = { "1d": 4, "5d": 10 };
const RANGE_BAR_MINUTES: Record<string, number> = { "1d": 1, "5d": 5 };
const RANGE_TRADING_DAYS: Record<string, number> = { "1d": 1, "5d": 5 };

/**
 * Intraday price series, from Massive's minute aggregates — the underlying
 * stock, not the options chain, so this is a different endpoint from
 * everything else that touches MASSIVE_API_KEY on this page. Upgraded from a
 * free Yahoo proxy now that Massive calls are unlimited on this account: 1m
 * bars for 1D (was Yahoo's 5m) and 5m bars for 5D (was 15m).
 *
 * Edge-cached same as before — a popular ticker within the same 60s window
 * shares one upstream fetch rather than paying for it per visitor.
 */
async function handleChart(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const ticker = parseTicker(url.searchParams.get("ticker"));
  const range = url.searchParams.get("range") ?? "1d";
  const barMinutes = RANGE_BAR_MINUTES[range];

  if (!ticker) return json({ error: "Missing or malformed `ticker`." }, 400);
  if (!barMinutes) {
    return json(
      {
        error: `Unsupported range. Use one of: ${Object.keys(RANGE_BAR_MINUTES).join(", ")}.`,
      },
      400,
    );
  }
  if (!env.MASSIVE_API_KEY) {
    return json({ error: "Chart data is not configured." }, 503);
  }

  const cache = caches.default;
  const cacheKey = new Request(
    `https://cache.internal/chart/${ticker}/${range}`,
    { method: "GET" },
  );
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Checked only on a cache miss — a cache hit costs Massive nothing, so it
  // shouldn't spend from the budget that protects Massive spend.
  const globalLimit = await checkGlobalRateLimit(
    env,
    "chart",
    Number(env.GLOBAL_CHART_PER_HOUR ?? DEFAULT_GLOBAL_CHART_PER_HOUR),
  );
  if (!globalLimit.ok) {
    return json(
      {
        error:
          "Chart data is at capacity site-wide right now. Try again shortly.",
      },
      429,
      { "retry-after": "3600" },
    );
  }

  const now = new Date();
  const to = etDateString(now);
  const from = etDateString(
    new Date(now.getTime() - RANGE_LOOKBACK_DAYS[range] * 86_400_000),
  );

  let bars: MassiveAggBar[];
  let previousClose: number | null;
  try {
    [bars, previousClose] = await Promise.all([
      fetchMassiveAggs(env, ticker, barMinutes, "minute", from, to),
      fetchMassivePrevClose(env, ticker),
    ]);
  } catch (err) {
    console.error("chart fetch failed", { ticker, range, err: String(err) });
    return json(
      { error: `Couldn't reach the price data provider for ${ticker}.` },
      502,
    );
  }

  // The lookback buffer intentionally overshoots (to survive weekends and
  // holidays); trim to the labeled number of trading days by keeping only
  // the most recent N distinct ET calendar dates present in the bars.
  const distinctDates = [
    ...new Set(bars.map((b) => etDateString(new Date(b.t)))),
  ];
  const keepDates = new Set(distinctDates.slice(-RANGE_TRADING_DAYS[range]));
  const trimmed = bars.filter((b) =>
    keepDates.has(etDateString(new Date(b.t))),
  );

  const points: ChartPoint[] = trimmed.map((b) => ({
    t: new Date(b.t).toISOString(),
    close: b.c,
    open: b.o,
    high: b.h,
    low: b.l,
    volume: b.v ?? 0,
  }));

  const payload: ChartResponse = {
    ticker,
    range,
    interval: `${barMinutes}m`,
    currency: "USD",
    regular_market_price: points.length
      ? points[points.length - 1].close
      : null,
    previous_close: previousClose,
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

export interface IndicatorPoint {
  date: string; // ISO date
  value: number;
}

export interface MACDPoint {
  date: string; // ISO date
  macd: number;
  signal: number;
  histogram: number;
}

export interface IndicatorsResponse {
  ticker: string;
  sma20: IndicatorPoint[];
  ema50: IndicatorPoint[];
  rsi14: IndicatorPoint[];
  macd: MACDPoint[];
}

const INDICATOR_CACHE_SECONDS = 3_600; // daily indicators only change once a day, at the close.
const INDICATOR_LIMIT = 5000; // comfortably above a year of daily values (~252).

async function fetchMassiveIndicator(
  env: Env,
  ticker: string,
  kind: "sma" | "ema" | "rsi",
  window: number,
): Promise<IndicatorPoint[]> {
  try {
    const url = new URL(`${MASSIVE_BASE}/v1/indicators/${kind}/${ticker}`);
    url.searchParams.set("timespan", "day");
    url.searchParams.set("window", String(window));
    url.searchParams.set("series_type", "close");
    url.searchParams.set("order", "asc");
    url.searchParams.set("limit", String(INDICATOR_LIMIT));
    url.searchParams.set("apiKey", env.MASSIVE_API_KEY);

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      results?: { values?: Array<{ timestamp?: number; value?: number }> };
    };
    return (body.results?.values ?? [])
      .filter(
        (v): v is { timestamp: number; value: number } =>
          typeof v.timestamp === "number" && typeof v.value === "number",
      )
      .map((v) => ({
        date: etDateString(new Date(v.timestamp)),
        value: v.value,
      }));
  } catch (err) {
    console.error("indicator fetch failed", {
      ticker,
      kind,
      window,
      err: String(err),
    });
    return [];
  }
}

async function fetchMassiveMACD(
  env: Env,
  ticker: string,
): Promise<MACDPoint[]> {
  try {
    const url = new URL(`${MASSIVE_BASE}/v1/indicators/macd/${ticker}`);
    url.searchParams.set("timespan", "day");
    url.searchParams.set("short_window", "12");
    url.searchParams.set("long_window", "26");
    url.searchParams.set("signal_window", "9");
    url.searchParams.set("series_type", "close");
    url.searchParams.set("order", "asc");
    url.searchParams.set("limit", String(INDICATOR_LIMIT));
    url.searchParams.set("apiKey", env.MASSIVE_API_KEY);

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      results?: {
        values?: Array<{
          timestamp?: number;
          value?: number;
          signal?: number;
          histogram?: number;
        }>;
      };
    };
    return (body.results?.values ?? [])
      .filter(
        (
          v,
        ): v is {
          timestamp: number;
          value: number;
          signal: number;
          histogram: number;
        } =>
          typeof v.timestamp === "number" &&
          typeof v.value === "number" &&
          typeof v.signal === "number" &&
          typeof v.histogram === "number",
      )
      .map((v) => ({
        date: etDateString(new Date(v.timestamp)),
        macd: v.value,
        signal: v.signal,
        histogram: v.histogram,
      }));
  } catch (err) {
    console.error("macd fetch failed", { ticker, err: String(err) });
    return [];
  }
}

/** Rolling mean over `bars`, keyed by each bar's own ISO timestamp so it
 * lines up exactly with the chart's own points — no separate fetch to
 * possibly disagree with. Skips the first `window - 1` bars (standard
 * warm-up; overlayPath already draws that as a gap, not a flat run-in). */
function computeSMA(bars: MassiveAggBar[], window: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].c;
    if (i >= window) sum -= bars[i - window].c;
    if (i >= window - 1)
      out.push({
        date: new Date(bars[i].t).toISOString(),
        value: sum / window,
      });
  }
  return out;
}

/** Exponential moving average over `bars`, seeded with the plain average of
 * the first `window` bars (the standard EMA warm-up), then keyed the same
 * way as computeSMA. */
function computeEMA(bars: MassiveAggBar[], window: number): IndicatorPoint[] {
  if (bars.length < window) return [];
  const k = 2 / (window + 1);
  let seed = 0;
  for (let i = 0; i < window; i++) seed += bars[i].c;
  let ema = seed / window;
  const out: IndicatorPoint[] = [
    { date: new Date(bars[window - 1].t).toISOString(), value: ema },
  ];
  for (let i = window; i < bars.length; i++) {
    ema = bars[i].c * k + ema * (1 - k);
    out.push({ date: new Date(bars[i].t).toISOString(), value: ema });
  }
  return out;
}

/** Wilder's RSI over `bars`. Seeded with the plain average gain/loss over
 * the first `window` price changes, then smoothed the same way every bar
 * after. A window with zero movement in both directions reads as neutral
 * (50) rather than the divide-by-zero "100" a naive gain/loss ratio would
 * give a flat line. */
function computeRSI(bars: MassiveAggBar[], window: number): IndicatorPoint[] {
  if (bars.length <= window) return [];
  const rsiFrom = (avgGain: number, avgLoss: number) => {
    if (avgGain === 0 && avgLoss === 0) return 50;
    if (avgLoss === 0) return 100;
    return 100 - 100 / (1 + avgGain / avgLoss);
  };

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= window; i++) {
    const diff = bars[i].c - bars[i - 1].c;
    if (diff > 0) gainSum += diff;
    else lossSum -= diff;
  }
  let avgGain = gainSum / window;
  let avgLoss = lossSum / window;
  const out: IndicatorPoint[] = [
    {
      date: new Date(bars[window].t).toISOString(),
      value: rsiFrom(avgGain, avgLoss),
    },
  ];
  for (let i = window + 1; i < bars.length; i++) {
    const diff = bars[i].c - bars[i - 1].c;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (window - 1) + gain) / window;
    avgLoss = (avgLoss * (window - 1) + loss) / window;
    out.push({
      date: new Date(bars[i].t).toISOString(),
      value: rsiFrom(avgGain, avgLoss),
    });
  }
  return out;
}

/** EMA over raw closes, returned index-aligned with `closes` (null before
 * warm-up) — the building block computeMACD needs twice (once per leg) and
 * once more over the MACD line itself for the signal, which computeEMA's
 * own IndicatorPoint-keyed shape isn't set up for. */
function emaSeries(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < window) return out;
  const k = 2 / (window + 1);
  let seed = 0;
  for (let i = 0; i < window; i++) seed += values[i];
  let ema = seed / window;
  out[window - 1] = ema;
  for (let i = window; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

/** MACD line (12-EMA − 26-EMA), its 9-EMA signal line, and the histogram
 * between them — the standard 12/26/9 windows, over `bars`' own closes. */
function computeMACD(
  bars: MassiveAggBar[],
  shortWindow: number,
  longWindow: number,
  signalWindow: number,
): MACDPoint[] {
  if (bars.length < longWindow + signalWindow) return [];
  const closes = bars.map((b) => b.c);
  const emaShort = emaSeries(closes, shortWindow);
  const emaLong = emaSeries(closes, longWindow);

  // MACD is defined from longWindow-1 onward — emaLong's warm-up is the
  // longer of the two, so emaShort is always already available by then.
  const macd: number[] = [];
  for (let i = longWindow - 1; i < bars.length; i++) {
    macd.push((emaShort[i] as number) - (emaLong[i] as number));
  }

  // The signal is an EMA of the MACD line itself, computed over that
  // compact array; map its indices back to bar indices via the offset the
  // MACD line started at.
  const signalOverMacd = emaSeries(macd, signalWindow);
  const out: MACDPoint[] = [];
  for (let j = signalWindow - 1; j < macd.length; j++) {
    const barIdx = j + (longWindow - 1);
    const macdVal = macd[j];
    const signalVal = signalOverMacd[j] as number;
    out.push({
      date: new Date(bars[barIdx].t).toISOString(),
      macd: macdVal,
      signal: signalVal,
      histogram: macdVal - signalVal,
    });
  }
  return out;
}

/**
 * 20-period SMA, 50-period EMA, 14-period RSI, and 12/26/9 MACD for the
 * price chart, in whatever bar granularity that range's own chart uses (1m
 * for 1D, 5m for 5D, daily for 1Y) — an overlay computed on a coarser
 * timespan than what's on screen wouldn't line up with it. All four are
 * fetched unconditionally; the frontend decides which to render (default:
 * none — these are opt-in via the chart's settings menu, not a page-load
 * cost anyone pays for free).
 *
 * 1Y: Massive computes this server-side, so there's no rolling-window math
 * to get subtly wrong here. 1D/5D: computed locally from the same minute
 * aggregates the chart itself fetches (fetchMassiveAggs) — a second call to
 * Massive's own indicator endpoint would risk its bars not lining up with
 * the chart's, since they'd be two independent fetches.
 */
async function handleIndicators(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const ticker = parseTicker(url.searchParams.get("ticker"));
  const range = url.searchParams.get("range") ?? "1y";
  if (!ticker) return json({ error: "Missing or malformed `ticker`." }, 400);
  if (range !== "1y" && !RANGE_BAR_MINUTES[range]) {
    return json(
      {
        error: `Unsupported range. Use one of: 1y, ${Object.keys(RANGE_BAR_MINUTES).join(", ")}.`,
      },
      400,
    );
  }
  if (!env.MASSIVE_API_KEY)
    return json({ error: "Indicators are not configured." }, 503);

  const cache = caches.default;
  const cacheKey = new Request(
    `https://cache.internal/indicators/${ticker}/${range}`,
    {
      method: "GET",
    },
  );
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const globalLimit = await checkGlobalRateLimit(
    env,
    "indicators",
    Number(
      env.GLOBAL_INDICATORS_PER_HOUR ?? DEFAULT_GLOBAL_INDICATORS_PER_HOUR,
    ),
  );
  if (!globalLimit.ok) {
    return json(
      {
        error:
          "Indicator data is at capacity site-wide right now. Try again shortly.",
      },
      429,
      { "retry-after": "3600" },
    );
  }

  let sma20: IndicatorPoint[];
  let ema50: IndicatorPoint[];
  let rsi14: IndicatorPoint[];
  let macd: MACDPoint[];
  let cacheSeconds: number;

  if (range === "1y") {
    [sma20, ema50, rsi14, macd] = await Promise.all([
      fetchMassiveIndicator(env, ticker, "sma", 20),
      fetchMassiveIndicator(env, ticker, "ema", 50),
      fetchMassiveIndicator(env, ticker, "rsi", 14),
      fetchMassiveMACD(env, ticker),
    ]);
    cacheSeconds = INDICATOR_CACHE_SECONDS;
  } else {
    const barMinutes = RANGE_BAR_MINUTES[range];
    const now = new Date();
    const to = etDateString(now);
    const from = etDateString(
      new Date(now.getTime() - RANGE_LOOKBACK_DAYS[range] * 86_400_000),
    );
    let bars: MassiveAggBar[] = [];
    try {
      bars = await fetchMassiveAggs(
        env,
        ticker,
        barMinutes,
        "minute",
        from,
        to,
      );
    } catch (err) {
      console.error("indicator aggs fetch failed", {
        ticker,
        range,
        err: String(err),
      });
    }
    sma20 = computeSMA(bars, 20);
    ema50 = computeEMA(bars, 50);
    rsi14 = computeRSI(bars, 14);
    macd = computeMACD(bars, 12, 26, 9);
    cacheSeconds = CHART_CACHE_SECONDS;
  }

  const payload: IndicatorsResponse = { ticker, sma20, ema50, rsi14, macd };
  const response = json(payload, 200, {
    "cache-control": `public, max-age=${cacheSeconds}`,
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

export interface FinancialsQuarter {
  fiscal_year: number;
  fiscal_period: string; // "Q1".."Q4" for quarterly, "FY" for annual
  period_end: string; // ISO date
  filing_date: string | null;
  filing_url: string | null;
  revenue: number | null;
  gross_profit: number | null;
  operating_income: number | null;
  net_income: number | null;
  diluted_eps: number | null;
}

/**
 * The real, public SEC EDGAR filing-index page for one quarter's 10-Q/10-K —
 * built from the CIK and accession number Massive's response carries.
 * `source_filing_url` is Polygon's own API URL (auth-required, not something
 * a reader can open), but its last path segment IS the actual SEC accession
 * number, which is all EDGAR's public URL scheme needs.
 */
function edgarFilingUrl(
  cik: string | undefined,
  sourceFilingUrl: string | undefined,
): string | null {
  if (!cik || !sourceFilingUrl) return null;
  const accession = sourceFilingUrl.split("/").pop();
  if (!accession || !/^\d{10}-\d{2}-\d{6}$/.test(accession)) return null;
  const cikInt = String(Number(cik));
  const accessionNoDash = accession.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accessionNoDash}/${accession}-index.htm`;
}

export interface FinancialsResponse {
  ticker: string;
  quarters: FinancialsQuarter[];
}

const FINANCIALS_CACHE_SECONDS = 86_400; // a company files a new 10-Q/10-K a few times a year at most.
// SEC XBRL data generally starts ~2009 (the mandate's rollout), so these caps
// are "give me everything reasonable to ask for," not an arbitrary window —
// verified against AAPL, which has 17 annual and 60+ quarterly periods on
// file. Same Massive plan, zero extra cost; we were just under-asking.
const QUARTERLY_LIMIT = 40; // ~10 years
const ANNUAL_LIMIT = 20; // ~20 years

// CPI updates once a month (mid-month release), so a day-long edge cache on
// a single shared key (not per-request) costs no real freshness while
// cutting FRED calls to about one per day site-wide, regardless of traffic.
const CPI_CACHE_SECONDS = 86_400;
const CPI_MONTHS = 12;

export interface CpiMonth {
  month: string; // "YYYY-MM"
  index: number;
  core_index: number | null;
  mom_pct: number | null;
  yoy_pct: number | null;
  core_mom_pct: number | null;
  core_yoy_pct: number | null;
}

export interface CpiHistoryResponse {
  months: CpiMonth[]; // most recent first
  source: string;
}

/** FRED's plain CSV export — "DATE,VALUE\n2026-07-01,332.813" — with blank
 * values for months not yet finalized. No API key: this is the same public,
 * unauthenticated endpoint fred.stlouisfed.org serves its own graphs from. */
function parseFredCsv(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of text.trim().split("\n").slice(1)) {
    const [date, value] = line.split(",");
    // A month FRED hasn't finalized yet is a blank field ("2025-10-01,\n"),
    // not a zero — `Number("")` is 0, not NaN, so this has to be checked
    // explicitly or a missing month silently becomes a real (wrong) value.
    if (!value || value.trim() === "") continue;
    const n = Number(value);
    if (date && Number.isFinite(n)) out.set(date.slice(0, 7), n);
  }
  return out;
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function pctChange(
  curr: number | undefined,
  prev: number | undefined,
): number | null {
  if (curr === undefined || prev === undefined || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

/**
 * Headline and core CPI, month-over-month and year-over-year, computed from
 * the Fed's own FRED series (CPIAUCSL, CPILFESL) rather than a static
 * table — inflation data every month would otherwise go stale exactly the
 * way this app avoids everywhere else. FRED keeps decades of history per
 * series, so year-over-year deltas are computed against the full fetched
 * range even though only the most recent CPI_MONTHS are returned.
 */
async function handleCpiHistory(
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const cache = caches.default;
  // v2: bumped after fixing a blank-month-parses-as-zero bug — the Cache API
  // persists across deploys, so a stale cached response under the old key
  // would otherwise keep serving the broken values for up to 24h.
  const cacheKey = new Request("https://cache.internal/macro/cpi-history-v2", {
    method: "GET",
  });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const [headlineRes, coreRes] = await Promise.all([
      fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL", {
        signal: AbortSignal.timeout(10_000),
      }),
      fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPILFESL", {
        signal: AbortSignal.timeout(10_000),
      }),
    ]);
    if (!headlineRes.ok || !coreRes.ok) {
      return json({ error: "CPI data temporarily unavailable." }, 502);
    }

    const headline = parseFredCsv(await headlineRes.text());
    const core = parseFredCsv(await coreRes.text());
    const recentKeys = [...headline.keys()].sort().slice(-CPI_MONTHS);

    const months: CpiMonth[] = recentKeys
      .map((key): CpiMonth | null => {
        const index = headline.get(key);
        if (index === undefined) return null;
        const coreIndex = core.get(key) ?? null;
        const prevMonthKey = shiftMonth(key, -1);
        const prevYearKey = shiftMonth(key, -12);
        return {
          month: key,
          index,
          core_index: coreIndex,
          mom_pct: pctChange(index, headline.get(prevMonthKey)),
          yoy_pct: pctChange(index, headline.get(prevYearKey)),
          core_mom_pct:
            coreIndex !== null
              ? pctChange(coreIndex, core.get(prevMonthKey))
              : null,
          core_yoy_pct:
            coreIndex !== null
              ? pctChange(coreIndex, core.get(prevYearKey))
              : null,
        };
      })
      .filter((m): m is CpiMonth => m !== null)
      .reverse();

    const payload: CpiHistoryResponse = {
      months,
      source:
        "FRED (Federal Reserve Bank of St. Louis), series CPIAUCSL & CPILFESL",
    };
    const response = json(payload, 200, {
      "cache-control": `public, max-age=${CPI_CACHE_SECONDS}`,
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    console.error("cpi history fetch failed", { err: String(err) });
    return json({ error: "Couldn't reach the CPI data provider." }, 502);
  }
}

const ANNUAL_FORM_TYPES = new Set([
  "10-K",
  "10-K/A",
  "20-F",
  "20-F/A",
  "40-F",
  "40-F/A",
]);

interface SecFactPoint {
  end?: string;
  val?: number;
  accn?: string;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
}

interface SecCompanyFacts {
  facts?: {
    "us-gaap"?: Record<string, { units?: Record<string, SecFactPoint[]> }>;
    "ifrs-full"?: Record<string, { units?: Record<string, SecFactPoint[]> }>;
  };
}

/** Tries each candidate concept name, us-gaap first then ifrs-full, in the
 * given unit key, returning the first with any data. Foreign filers
 * reporting in their own currency (not USD) are skipped entirely rather
 * than mislabeled — there's no FX conversion here, and a wrong number
 * presented confidently is worse than no number. */
function pickSecConcept(
  facts: SecCompanyFacts["facts"],
  names: string[],
  unitKey: string,
): SecFactPoint[] | null {
  for (const taxonomy of ["us-gaap", "ifrs-full"] as const) {
    const ns = facts?.[taxonomy];
    if (!ns) continue;
    for (const name of names) {
      const points = ns[name]?.units?.[unitKey];
      if (points && points.length > 0) return points;
    }
  }
  return null;
}

function findAtEnd(points: SecFactPoint[] | null, end: string): number | null {
  if (!points) return null;
  return points.find((p) => p.end === end && p.val !== undefined)?.val ?? null;
}

/**
 * Fallback for when Massive's financials endpoint has nothing — mainly
 * foreign private issuers, who file an annual 20-F (or Canadian 40-F)
 * instead of a 10-K/10-Q and whose XBRL vX/reference/financials doesn't
 * surface. SEC's own companyfacts API has it directly: free, unauthenticated,
 * and covers any filer that's submitted Inline XBRL (mandatory for
 * large/foreign filers using IFRS for fiscal periods after 2020).
 *
 * Annual only, deliberately — most foreign private issuers don't file
 * interim XBRL the way a domestic 10-Q filer does, so there's no quarterly
 * equivalent to synthesize here. A `timeframe=quarterly` request still gets
 * the plain "no data" empty state; only `annual` gets this fallback.
 */
async function fetchSecAnnualFinancials(
  env: Env,
  ticker: string,
): Promise<FinancialsQuarter[]> {
  const tickerUrl = new URL(`${MASSIVE_BASE}/v3/reference/tickers/${ticker}`);
  tickerUrl.searchParams.set("apiKey", env.MASSIVE_API_KEY);
  const tickerRes = await fetch(tickerUrl.toString(), {
    signal: AbortSignal.timeout(10_000),
  });
  const cik = tickerRes.ok
    ? ((await tickerRes.json()) as { results?: { cik?: string } }).results?.cik
    : undefined;
  if (!cik) return [];

  const cikPadded = String(Number(cik)).padStart(10, "0");
  const factsRes = await fetch(
    `https://data.sec.gov/api/xbrl/companyfacts/CIK${cikPadded}.json`,
    {
      // SEC's fair-access policy blocks requests with no descriptive
      // User-Agent (confirmed empirically — a generic/absent one 403s).
      headers: { "User-Agent": "PrintEarnings (printearnings.com)" },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!factsRes.ok) return [];
  const facts = ((await factsRes.json()) as SecCompanyFacts).facts;
  if (!facts) return [];

  const revenue = pickSecConcept(
    facts,
    [
      "Revenues",
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "SalesRevenueNet",
      "Revenue",
    ],
    "USD",
  );
  if (!revenue) return [];

  const netIncome = pickSecConcept(
    facts,
    ["NetIncomeLoss", "ProfitLoss", "ProfitLossAttributableToOwnersOfParent"],
    "USD",
  );
  const grossProfit = pickSecConcept(facts, ["GrossProfit"], "USD");
  const operatingIncome = pickSecConcept(
    facts,
    ["OperatingIncomeLoss", "ProfitLossFromOperatingActivities"],
    "USD",
  );
  const dilutedEps = pickSecConcept(
    facts,
    ["EarningsPerShareDiluted", "DilutedEarningsLossPerShare"],
    "USD/shares",
  );

  // One row per fiscal-year end, keyed off revenue's own annual-form
  // entries. A company can amend a prior year's filing, so the
  // most-recently-filed value for a given period wins regardless of which
  // one is encountered first while iterating.
  const byPeriod = new Map<string, FinancialsQuarter>();
  for (const point of revenue) {
    if (
      !point.form ||
      !ANNUAL_FORM_TYPES.has(point.form) ||
      !point.end ||
      point.val === undefined
    ) {
      continue;
    }
    const existing = byPeriod.get(point.end);
    if (
      existing?.filing_date &&
      point.filed &&
      point.filed <= existing.filing_date
    ) {
      continue;
    }
    byPeriod.set(point.end, {
      fiscal_year: point.fy ?? new Date(point.end).getUTCFullYear(),
      fiscal_period: "FY",
      period_end: point.end,
      filing_date: point.filed ?? null,
      filing_url: point.accn
        ? `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${point.accn.replace(/-/g, "")}/${point.accn}-index.htm`
        : null,
      revenue: point.val,
      gross_profit: findAtEnd(grossProfit, point.end),
      operating_income: findAtEnd(operatingIncome, point.end),
      net_income: findAtEnd(netIncome, point.end),
      diluted_eps: findAtEnd(dilutedEps, point.end),
    });
  }

  return [...byPeriod.values()].sort((a, b) =>
    b.period_end.localeCompare(a.period_end),
  );
}

/**
 * Quarterly or annual income-statement figures — revenue, margins, net
 * income, diluted EPS — from SEC filings via Massive's financials API.
 * Fetched on demand rather than baked into the nightly snapshot: a company
 * only re-files a handful of times a year, so a 24h edge cache already
 * removes almost all of the metered-call cost without needing a DB column.
 */
async function handleFinancials(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const ticker = parseTicker(url.searchParams.get("ticker"));
  if (!ticker) return json({ error: "Missing or malformed `ticker`." }, 400);
  if (!env.MASSIVE_API_KEY)
    return json({ error: "Financials are not configured." }, 503);

  const timeframe =
    url.searchParams.get("timeframe") === "annual" ? "annual" : "quarterly";

  const cache = caches.default;
  // v2: bumped after adding the Yahoo/SEC fallbacks below — the Cache API
  // persists across deploys, so tickers already cached empty (queried
  // before this existed) would otherwise keep serving that empty response
  // for up to 24h despite the fallback now having real data for them.
  const cacheKey = new Request(
    `https://cache.internal/financials-v2/${ticker}/${timeframe}`,
    {
      method: "GET",
    },
  );
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const globalLimit = await checkGlobalRateLimit(
    env,
    "financials",
    Number(
      env.GLOBAL_FINANCIALS_PER_HOUR ?? DEFAULT_GLOBAL_FINANCIALS_PER_HOUR,
    ),
  );
  if (!globalLimit.ok) {
    return json(
      {
        error:
          "Financials are at capacity site-wide right now. Try again shortly.",
      },
      429,
      { "retry-after": "3600" },
    );
  }

  let quarters: FinancialsQuarter[] = [];
  try {
    // The newer /stocks/financials/v1/* family isn't included in this
    // account's plan (confirmed: NOT_AUTHORIZED) — this older,
    // Polygon-shaped endpoint is. Its XBRL-derived shape nests every line
    // item as `{value, unit, label, order}` rather than flat fields.
    const apiUrl = new URL(`${MASSIVE_BASE}/vX/reference/financials`);
    apiUrl.searchParams.set("ticker", ticker);
    apiUrl.searchParams.set("timeframe", timeframe);
    apiUrl.searchParams.set(
      "limit",
      String(timeframe === "annual" ? ANNUAL_LIMIT : QUARTERLY_LIMIT),
    );
    apiUrl.searchParams.set("order", "desc");
    apiUrl.searchParams.set("sort", "period_of_report_date");
    apiUrl.searchParams.set("apiKey", env.MASSIVE_API_KEY);

    const res = await fetch(apiUrl.toString(), {
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      interface LineItem {
        value?: number;
      }
      const body = (await res.json()) as {
        results?: Array<{
          fiscal_year?: string;
          fiscal_period?: string;
          end_date?: string;
          filing_date?: string;
          cik?: string;
          source_filing_url?: string;
          financials?: {
            income_statement?: {
              revenues?: LineItem;
              gross_profit?: LineItem;
              operating_income_loss?: LineItem;
              net_income_loss?: LineItem;
              diluted_earnings_per_share?: LineItem;
            };
          };
        }>;
      };
      quarters = (body.results ?? [])
        .map((r) => {
          const inc = r.financials?.income_statement;
          return {
            fiscal_year: Number(r.fiscal_year),
            fiscal_period: r.fiscal_period ?? "",
            period_end: r.end_date,
            filing_date: r.filing_date ?? null,
            filing_url: edgarFilingUrl(r.cik, r.source_filing_url),
            revenue: inc?.revenues?.value ?? null,
            gross_profit: inc?.gross_profit?.value ?? null,
            operating_income: inc?.operating_income_loss?.value ?? null,
            net_income: inc?.net_income_loss?.value ?? null,
            diluted_eps: inc?.diluted_earnings_per_share?.value ?? null,
          };
        })
        .filter(
          (q): q is FinancialsQuarter =>
            Number.isFinite(q.fiscal_year) &&
            q.fiscal_period !== "" &&
            typeof q.period_end === "string",
        )
        // Server-side sort/order is honored (verified), but re-sorting
        // defensively costs nothing and guards against a future change.
        .sort((a, b) => b.period_end.localeCompare(a.period_end));
    }
  } catch (err) {
    console.error("financials fetch failed", { ticker, err: String(err) });
  }

  // Massive's financials endpoint mostly only covers domestic 10-Q/10-K
  // filers — a foreign private issuer's 20-F genuinely has no quarterly
  // filing for it to have found, but the underlying figures are real and
  // public. Two fallbacks, in order: Yahoo's aggregation first (covers
  // both quarterly and annual, already USD-normalized, verified live
  // against actual foreign filers), then SEC's own companyfacts API
  // (annual only, and only for filers reporting natively in USD) for
  // whatever Yahoo still doesn't have.
  if (quarters.length === 0) {
    try {
      quarters = await fetchYahooFinancials(env, ticker, timeframe);
    } catch (err) {
      console.error("yahoo financials fetch failed", {
        ticker,
        err: String(err),
      });
    }
  }
  if (quarters.length === 0 && timeframe === "annual") {
    try {
      quarters = await fetchSecAnnualFinancials(env, ticker);
    } catch (err) {
      console.error("sec companyfacts fetch failed", {
        ticker,
        err: String(err),
      });
    }
  }

  const payload: FinancialsResponse = { ticker, quarters };
  const response = json(payload, 200, {
    "cache-control": `public, max-age=${FINANCIALS_CACHE_SECONDS}`,
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

// Form 4 must be filed within two business days of a trade, so this is the
// timeliest disclosure available anywhere short of paying for a real-time
// feed — but a company only files a handful of these a month, so caching
// for hours (not the ~minute-scale of the price chart) doesn't cost
// freshness that matters.
const INSIDERS_CACHE_SECONDS = 21_600;
const INSIDER_LIMIT = 40;

export interface InsiderTransaction {
  filing_date: string | null;
  transaction_date: string | null;
  owner_name: string | null;
  officer_title: string | null;
  is_director: boolean;
  is_officer: boolean;
  is_ten_percent_owner: boolean;
  transaction_code: string | null;
  acquired_or_disposed: "A" | "D" | null;
  shares: number | null;
  price_per_share: number | null;
  value: number | null;
  shares_owned_after: number | null;
  filing_url: string | null;
}

/**
 * SEC Form 4 insider transactions — who at the company (officer, director,
 * 10% owner) bought or sold shares, and when.
 *
 * Massive's form-4 endpoint filters by `issuer_cik`, not by ticker directly
 * (confirmed by inspection: a `ticker` query param is silently ignored and
 * the endpoint falls back to its own default sort). CIK is resolved first
 * via the ticker-details endpoint, which already carries a `cik` field —
 * no separate SEC ticker-to-CIK mapping file needed.
 */
async function handleInsiders(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const ticker = parseTicker(url.searchParams.get("ticker"));
  if (!ticker) return json({ error: "Missing or malformed `ticker`." }, 400);
  if (!env.MASSIVE_API_KEY) {
    return json({ error: "Insider activity is not configured." }, 503);
  }

  const cache = caches.default;
  const cacheKey = new Request(`https://cache.internal/insiders/${ticker}`, {
    method: "GET",
  });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const globalLimit = await checkGlobalRateLimit(
    env,
    "insiders",
    Number(env.GLOBAL_INSIDERS_PER_HOUR ?? DEFAULT_GLOBAL_INSIDERS_PER_HOUR),
  );
  if (!globalLimit.ok) {
    return json(
      {
        error:
          "Insider activity is at capacity site-wide right now. Try again shortly.",
      },
      429,
      { "retry-after": "3600" },
    );
  }

  let transactions: InsiderTransaction[] = [];
  try {
    const tickerUrl = new URL(`${MASSIVE_BASE}/v3/reference/tickers/${ticker}`);
    tickerUrl.searchParams.set("apiKey", env.MASSIVE_API_KEY);
    const tickerRes = await fetch(tickerUrl.toString(), {
      signal: AbortSignal.timeout(10_000),
    });
    const tickerBody = tickerRes.ok
      ? ((await tickerRes.json()) as { results?: { cik?: string } })
      : null;
    const cik = tickerBody?.results?.cik;

    if (cik) {
      const apiUrl = new URL(`${MASSIVE_BASE}/stocks/filings/vX/form-4`);
      apiUrl.searchParams.set("issuer_cik", cik);
      apiUrl.searchParams.set("limit", String(INSIDER_LIMIT));
      apiUrl.searchParams.set("sort", "filing_date.desc");
      apiUrl.searchParams.set("apiKey", env.MASSIVE_API_KEY);

      const res = await fetch(apiUrl.toString(), {
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const body = (await res.json()) as {
          results?: Array<{
            filing_date?: string;
            transaction_date?: string;
            owner_name?: string;
            officer_title?: string;
            is_director?: boolean;
            is_officer?: boolean;
            is_ten_percent_owner?: boolean;
            transaction_code?: string;
            transaction_acquired_disposed?: string;
            transaction_shares?: number;
            transaction_price_per_share?: number;
            transaction_value?: number;
            shares_owned_following_transaction?: number;
            filing_url?: string;
          }>;
        };
        transactions = (body.results ?? [])
          // Form 4 also carries pure position-summary rows with no trade of
          // their own (Table I/II holdings disclosures) — a present share
          // count is what actually distinguishes a real transaction here,
          // not a `record_type` value nothing in this response confirms.
          .filter((r) => typeof r.transaction_shares === "number")
          .map((r) => ({
            filing_date: r.filing_date ?? null,
            transaction_date: r.transaction_date ?? null,
            owner_name: r.owner_name ?? null,
            officer_title: r.officer_title ?? null,
            is_director: r.is_director ?? false,
            is_officer: r.is_officer ?? false,
            is_ten_percent_owner: r.is_ten_percent_owner ?? false,
            transaction_code: r.transaction_code ?? null,
            acquired_or_disposed:
              r.transaction_acquired_disposed === "A" ||
              r.transaction_acquired_disposed === "D"
                ? r.transaction_acquired_disposed
                : null,
            shares: r.transaction_shares ?? null,
            price_per_share: r.transaction_price_per_share ?? null,
            value: r.transaction_value ?? null,
            shares_owned_after: r.shares_owned_following_transaction ?? null,
            filing_url: r.filing_url ?? null,
          }));
      }
    }
  } catch (err) {
    console.error("insiders fetch failed", { ticker, err: String(err) });
  }

  const payload = { ticker, transactions };
  const response = json(payload, 200, {
    "cache-control": `public, max-age=${INSIDERS_CACHE_SECONDS}`,
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

export interface LookupPricePoint {
  date: string; // ISO date
  close: number;
}

export interface LookupEarningsRow {
  // Yahoo's earningsHistory keys rows by fiscal *quarter end*, not the
  // announcement date the rest of the app means by "report_date" — labeled
  // accordingly in the UI rather than presented as the same field.
  quarter_end: string; // ISO date
  eps_estimate: number | null;
  eps_actual: number | null;
  eps_surprise_pct: number | null;
}

export interface LookupNewsItem {
  title: string;
  url: string | null;
  publisher: string | null;
  published_at: string | null; // ISO datetime
  thumbnail_url: string | null;
}

export interface LookupResponse {
  ticker: string;
  found: boolean;
  spot: number | null;
  previous_close: number | null;
  company_name: string | null;
  next_report_date: string | null; // ISO date, best-effort
  prices: LookupPricePoint[];
  earnings_history: LookupEarningsRow[];
  news: LookupNewsItem[];
}

const LOOKUP_CACHE_SECONDS = 300;
const YAHOO_UA = "Mozilla/5.0 (compatible; EarningsDeskBot/1.0)";

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
async function handleLookup(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const ticker = parseTicker(url.searchParams.get("ticker"));
  if (!ticker) return json({ error: "Missing or malformed `ticker`." }, 400);

  const cache = caches.default;
  const cacheKey = new Request(`https://cache.internal/lookup/${ticker}`, {
    method: "GET",
  });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const [chart, earnings, prices, news] = await Promise.all([
    fetchYahooChartMeta(ticker),
    fetchYahooEarnings(env, ticker),
    fetchYahoo1yDaily(ticker),
    fetchYahooNews(ticker),
  ]);

  // None of the four calls resolving to anything usable means the symbol
  // doesn't exist (or Yahoo has nothing on it) — a normal, expected outcome
  // for a search box open to arbitrary input, not a server error.
  const payload: LookupResponse = {
    ticker,
    found: chart !== null || prices.length > 0,
    spot: chart?.regularMarketPrice ?? null,
    previous_close: chart?.chartPreviousClose ?? null,
    company_name: chart?.shortName ?? null,
    next_report_date: earnings.nextReportDate,
    prices,
    earnings_history: earnings.history,
    news,
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
    const res = await fetch(
      `${YAHOO_CHART_BASE}/${ticker}?range=1d&interval=1d`,
      {
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; EarningsDeskBot/1.0)",
        },
        signal: AbortSignal.timeout(6_000),
      },
    );
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

interface YahooAuth {
  crumb: string;
  cookie: string;
}

const YAHOO_CRUMB_KV_KEY = "yahoo:crumb";
const YAHOO_CRUMB_TTL_SECONDS = 3_300; // under an hour — refreshed well before Yahoo expires it.

/**
 * Yahoo's `quoteSummary` family (unlike `chart`) now demands a crumb tied to
 * a session cookie — an unauthenticated request comes back `Unauthorized:
 * Invalid Crumb`. Cached in KV rather than fetched per-request: the crumb is
 * a bot-mitigation formality, not a per-visitor credential, so one Worker-
 * wide token shared across all lookups for under an hour is exactly as valid
 * as fetching a fresh one every time, for a fraction of the upstream calls.
 */
async function getYahooAuth(
  env: Env,
  { forceRefresh = false } = {},
): Promise<YahooAuth | null> {
  if (!forceRefresh) {
    const cached = await env.RATE_LIMIT.get(YAHOO_CRUMB_KV_KEY, "json");
    if (cached) return cached as YahooAuth;
  }

  try {
    const cookieRes = await fetch("https://fc.yahoo.com", {
      headers: { "user-agent": YAHOO_UA },
      signal: AbortSignal.timeout(6_000),
    });
    const setCookie = cookieRes.headers.get("set-cookie");
    if (!setCookie) return null;
    const cookie = setCookie.split(";")[0];

    const crumbRes = await fetch(
      "https://query2.finance.yahoo.com/v1/test/getcrumb",
      {
        headers: { "user-agent": YAHOO_UA, cookie },
        signal: AbortSignal.timeout(6_000),
      },
    );
    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    // A failed handshake returns an HTML error page, not a short token.
    if (!crumb || crumb.length > 64 || crumb.includes("<")) return null;

    const auth: YahooAuth = { crumb, cookie };
    await env.RATE_LIMIT.put(YAHOO_CRUMB_KV_KEY, JSON.stringify(auth), {
      expirationTtl: YAHOO_CRUMB_TTL_SECONDS,
    });
    return auth;
  } catch (err) {
    console.error("yahoo auth handshake failed", { err: String(err) });
    return null;
  }
}

/**
 * `quoteSummary` fetch with the crumb handshake, retrying once with a forced
 * fresh crumb if the cached one has expired server-side (KV's TTL is a
 * conservative estimate, not a guarantee — Yahoo is the actual authority).
 */
async function fetchYahooQuoteSummary(
  env: Env,
  ticker: string,
  modules: string,
): Promise<Record<string, unknown> | null> {
  for (const forceRefresh of [false, true]) {
    const auth = await getYahooAuth(env, { forceRefresh });
    if (!auth) continue;

    try {
      const url = `${YAHOO_QUOTE_SUMMARY_BASE}/${ticker}?modules=${modules}&crumb=${encodeURIComponent(auth.crumb)}`;
      const res = await fetch(url, {
        headers: { "user-agent": YAHOO_UA, cookie: auth.cookie },
        signal: AbortSignal.timeout(6_000),
      });
      if (!res.ok) continue;

      const body = (await res.json()) as {
        quoteSummary?: {
          result?: Array<Record<string, unknown>>;
          error?: unknown;
        };
      };
      if (body.quoteSummary?.error) continue; // e.g. "Invalid Crumb" — retry with a fresh one.
      const result = body.quoteSummary?.result?.[0];
      if (result) return result;
    } catch (err) {
      console.error("quoteSummary fetch failed", {
        ticker,
        modules,
        err: String(err),
      });
    }
  }
  return null;
}

interface YahooRaw {
  raw?: number;
}

/** Best-effort next earnings date + EPS history, from one quoteSummary call.
 * A miss on either just means that field stays empty — never a reason to
 * fail the whole lookup. */
async function fetchYahooEarnings(
  env: Env,
  ticker: string,
): Promise<{ nextReportDate: string | null; history: LookupEarningsRow[] }> {
  const result = await fetchYahooQuoteSummary(
    env,
    ticker,
    "calendarEvents,earningsHistory",
  );
  if (!result) return { nextReportDate: null, history: [] };

  const calendar = result.calendarEvents as
    { earnings?: { earningsDate?: YahooRaw[] } } | undefined;
  const nextRaw = calendar?.earnings?.earningsDate?.[0]?.raw;
  const nextReportDate = typeof nextRaw === "number" ? isoDate(nextRaw) : null;

  const rows = (
    result.earningsHistory as
      { history?: Record<string, unknown>[] } | undefined
  )?.history;
  const history: LookupEarningsRow[] = (rows ?? [])
    .map((row): LookupEarningsRow | null => {
      const quarterRaw = (row.quarter as YahooRaw | undefined)?.raw;
      if (typeof quarterRaw !== "number") return null;
      return {
        quarter_end: isoDate(quarterRaw),
        eps_estimate: (row.epsEstimate as YahooRaw | undefined)?.raw ?? null,
        eps_actual: (row.epsActual as YahooRaw | undefined)?.raw ?? null,
        eps_surprise_pct:
          (row.surprisePercent as YahooRaw | undefined)?.raw ?? null,
      };
    })
    .filter((r): r is LookupEarningsRow => r !== null)
    // Yahoo returns oldest-first; the rest of the app shows history newest-first.
    .reverse();

  return { nextReportDate, history };
}

function isoDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

/**
 * Second fallback for /api/financials, after Massive's own endpoint (which
 * only covers domestic 10-Q/10-K filers) and ahead of the SEC companyfacts
 * fallback below it — reuses the same crumb-authenticated quoteSummary
 * plumbing fetchYahooEarnings already relies on. Where SEC companyfacts
 * only has annual figures for a foreign filer (many don't tag interim
 * periods, and plenty report in a non-USD currency this app doesn't
 * convert), Yahoo's own aggregation frequently has both quarterly and
 * annual, already normalized to USD, for the same names.
 *
 * Yahoo represents "we don't have this line item" as a literal `0`, not a
 * missing field — passed through naively that reads as "this company had
 * $0 gross profit," which is wrong, not just absent. Zero is treated as
 * unavailable for the line items Yahoo is inconsistent about (gross
 * profit, operating income); revenue and net income are the two fields
 * actually reliable here, per live testing against known foreign filers.
 */
async function fetchYahooFinancials(
  env: Env,
  ticker: string,
  timeframe: "quarterly" | "annual",
): Promise<FinancialsQuarter[]> {
  const moduleName =
    timeframe === "annual"
      ? "incomeStatementHistory"
      : "incomeStatementHistoryQuarterly";
  const result = await fetchYahooQuoteSummary(env, ticker, moduleName);
  const entries =
    (
      result?.[moduleName] as
        { incomeStatementHistory?: Record<string, YahooRaw>[] } | undefined
    )?.incomeStatementHistory ?? [];

  return entries
    .map((e): FinancialsQuarter | null => {
      const periodEnd = (e.endDate as { fmt?: string } | undefined)?.fmt;
      const revenue = e.totalRevenue?.raw;
      if (!periodEnd || typeof revenue !== "number") return null;
      const nonZero = (v: number | undefined) =>
        typeof v === "number" && v !== 0 ? v : null;
      return {
        fiscal_year: Number(periodEnd.slice(0, 4)),
        fiscal_period:
          timeframe === "annual"
            ? "FY"
            : `Q${Math.floor((Number(periodEnd.slice(5, 7)) - 1) / 3) + 1}`,
        period_end: periodEnd,
        // Yahoo's aggregation doesn't carry the filing date or accession
        // number the way Massive/SEC's own responses do — nothing to link.
        filing_date: null,
        filing_url: null,
        revenue,
        gross_profit: nonZero(e.grossProfit?.raw),
        operating_income: nonZero(e.operatingIncome?.raw),
        net_income: nonZero(e.netIncome?.raw),
        diluted_eps: null,
      };
    })
    .filter((q): q is FinancialsQuarter => q !== null)
    .sort((a, b) => b.period_end.localeCompare(a.period_end));
}

/** A year of daily closes, live from Yahoo — the cold-lookup counterpart to
 * quotes.price_series() (which only runs for the tracked universe at build
 * time). Reuses the same chart endpoint as the intraday proxy but with a
 * range/interval combination `handleChart` deliberately doesn't serve. */
async function fetchYahoo1yDaily(ticker: string): Promise<LookupPricePoint[]> {
  try {
    const res = await fetch(
      `${YAHOO_CHART_BASE}/${ticker}?range=1y&interval=1d`,
      {
        headers: { "user-agent": YAHOO_UA },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: { quote?: Array<{ close?: (number | null)[] }> };
        }>;
      };
    };
    const result = body.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];

    const points: LookupPricePoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i];
      if (typeof close !== "number") continue;
      points.push({ date: isoDate(timestamps[i]), close });
    }
    return points;
  } catch (err) {
    console.error("1y chart fetch failed", { ticker, err: String(err) });
    return [];
  }
}

interface YahooNewsThumbnailResolution {
  tag?: string;
  url?: string;
}

/** Best-effort headline thumbnail: prefer any pre-sized resolution over the
 * full-size original — a list-row image, not a hero. Mirrors the engine's
 * `data.news._thumbnail_url`, adapted to this endpoint's flatter shape (see
 * that function's docstring for why the "original" tag is skipped). */
function newsThumbnailUrl(
  resolutions: YahooNewsThumbnailResolution[] | undefined,
): string | null {
  if (!resolutions?.length) return null;
  const sized = resolutions.find((r) => r.tag && r.tag !== "original" && r.url);
  if (sized) return sized.url ?? null;
  return resolutions.find((r) => r.url)?.url ?? null;
}

const NEWS_RESULT_LIMIT = 20; // matches the tracked-universe path's cap (news.py's MAX_HEADLINES)

/** Recent headlines, unfiltered by relevance (unlike the engine's per-ticker
 * feed) — a cold lookup has no company-name cache to check mentions against,
 * and a handful of loosely-related stories beats none for a ticker no other
 * part of the site has ever looked at. */
async function fetchYahooNews(ticker: string): Promise<LookupNewsItem[]> {
  try {
    const url = new URL("https://query1.finance.yahoo.com/v1/finance/search");
    url.searchParams.set("q", ticker);
    url.searchParams.set("newsCount", String(NEWS_RESULT_LIMIT));
    url.searchParams.set("quotesCount", "0");

    const res = await fetch(url.toString(), {
      headers: { "user-agent": YAHOO_UA },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return [];

    const body = (await res.json()) as {
      news?: Array<{
        title?: string;
        link?: string;
        publisher?: string;
        providerPublishTime?: number;
        thumbnail?: { resolutions?: YahooNewsThumbnailResolution[] };
      }>;
    };

    return (body.news ?? [])
      .filter((item): item is typeof item & { title: string } =>
        Boolean(item.title),
      )
      .slice(0, NEWS_RESULT_LIMIT)
      .map((item) => ({
        title: item.title,
        url: item.link ?? null,
        publisher: item.publisher ?? null,
        published_at:
          typeof item.providerPublishTime === "number"
            ? new Date(item.providerPublishTime * 1000).toISOString()
            : null,
        thumbnail_url: newsThumbnailUrl(item.thumbnail?.resolutions),
      }));
  } catch (err) {
    console.error("news fetch failed", { ticker, err: String(err) });
    return [];
  }
}

export interface SearchResult {
  ticker: string;
  name: string | null;
}

const SEARCH_CACHE_SECONDS = 21_600; // 6h — the reference list barely moves intraday.
const SEARCH_RESULT_LIMIT = 8;

/**
 * Ticker search backed by Massive's reference data (already-paid-for, the
 * same account /api/refresh uses) — matches on company name as well as
 * symbol, unlike the tracked-universe index the search box falls back to
 * client-side. Scoped to `market=stocks` so OTC/pink-sheet noise (e.g. a
 * "walmart" query surfacing WMMVF ahead of WMT) doesn't crowd out the name a
 * trader actually typed for.
 *
 * This is a metered call on every miss, so it's both edge-cached (a popular
 * query like "apple" shouldn't cost twice) and per-IP rate limited — search-
 * as-you-type fires far more often than the deliberate click that drives
 * /api/refresh, and deserves a correspondingly higher ceiling, not the same
 * one.
 */
async function handleSearch(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return json({ results: [] });
  if (q.length > 40) return json({ error: "Query too long." }, 400);

  if (!env.MASSIVE_API_KEY) {
    return json({ error: "Search is not configured." }, 503);
  }

  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const limit = await checkRateLimit(env, ip, {
    kind: "search",
    limit: Number(env.SEARCH_PER_HOUR ?? DEFAULT_SEARCH_PER_HOUR),
  });
  if (!limit.ok) {
    return json({ error: "Search limit reached, try again in a bit." }, 429, {
      "retry-after": "3600",
    });
  }

  const cacheKey = new Request(
    `https://cache.internal/search/${q.toLowerCase()}`,
    {
      method: "GET",
    },
  );
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const globalLimit = await checkGlobalRateLimit(
    env,
    "search",
    Number(env.GLOBAL_SEARCH_PER_HOUR ?? DEFAULT_GLOBAL_SEARCH_PER_HOUR),
  );
  if (!globalLimit.ok) {
    return json(
      {
        error: "Search is at capacity site-wide right now. Try again shortly.",
      },
      429,
      { "retry-after": "3600" },
    );
  }

  const upstream = new URL(`${MASSIVE_BASE}/v3/reference/tickers`);
  upstream.searchParams.set("search", q);
  upstream.searchParams.set("market", "stocks");
  upstream.searchParams.set("active", "true");
  upstream.searchParams.set("limit", String(SEARCH_RESULT_LIMIT));
  upstream.searchParams.set("apiKey", env.MASSIVE_API_KEY);

  let results: SearchResult[] = [];
  try {
    const res = await fetch(upstream.toString(), {
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const body = (await res.json()) as {
      results?: Array<{ ticker?: string; name?: string }>;
    };
    results = (body.results ?? [])
      .filter(
        (r): r is { ticker: string; name?: string } =>
          typeof r.ticker === "string",
      )
      .map((r) => ({ ticker: r.ticker, name: r.name ?? null }));
  } catch (err) {
    // Never surface the upstream error verbatim — it carries the API key.
    console.error("massive search failed", { q, err: String(err) });
    return json({ error: "Couldn't reach the search provider." }, 502);
  }

  const response = json({ results }, 200, {
    "cache-control": `public, max-age=${SEARCH_CACHE_SECONDS}`,
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

// Bound on the strike-bracketed follow-up pages `fetchChain` will fetch when
// `fullDepth` is requested. Confirmed empirically against AAPL (a wide,
// weekly-heavy chain): 3 bracketed pages already reached every expiry out to
// 2028 LEAPS at the (narrower) 15% bracket. Bumped from 5 to 8 alongside
// SIMULATOR_STRIKE_BRACKET's widening — a bigger strike window eats more of
// each page's 250-result budget before the pagination cursor reaches later
// expiries, so it takes more pages to cover the same depth.
const CHAIN_MAX_DEPTH_PAGES = 8;
// Expiries this far out are practically irrelevant to an earnings-print
// trade — stop paginating once we're past it even if pages remain.
const CHAIN_MAX_DEPTH_DAYS = 400;

async function fetchChainPage(
  env: Env,
  url: URL,
): Promise<{ results: RawContract[]; nextUrl: string | null }> {
  const res = await fetch(url.toString(), {
    // A hung upstream must not hold a Worker request open indefinitely.
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const body = (await res.json()) as {
    results?: RawContract[];
    next_url?: string;
  };
  return { results: body.results ?? [], nextUrl: body.next_url ?? null };
}

/**
 * `fullDepth: false` (default, used by /api/refresh) fetches one unfiltered
 * page — plenty to find the front expiry's ATM straddle, which is all that
 * path needs.
 *
 * `fullDepth: true` (used by /api/chain, the P&L simulator) additionally
 * paginates strike-bracketed follow-up requests so every expiry Massive
 * lists — not just whichever ones happen to fall inside the first 250
 * unfiltered rows — comes back. A liquid, weekly-heavy name like AAPL can
 * exhaust a 250-row unfiltered page within its first couple of expiries;
 * filtering by strike server-side (`strike_price.gte`/`.lte`, confirmed
 * supported by direct API testing) instead of after the fact makes each
 * page almost entirely useful rows.
 */
async function fetchChain(
  env: Env,
  ticker: string,
  reportDate: string,
  opts: { fullDepth?: boolean } = {},
): Promise<RawContract[]> {
  const firstUrl = new URL(`${MASSIVE_BASE}/v3/snapshot/options/${ticker}`);
  firstUrl.searchParams.set("expiration_date.gte", reportDate);
  firstUrl.searchParams.set("limit", "250");
  firstUrl.searchParams.set("sort", "expiration_date");
  firstUrl.searchParams.set("order", "asc");
  firstUrl.searchParams.set("apiKey", env.MASSIVE_API_KEY);

  const first = await fetchChainPage(env, firstUrl);

  // The strike bracket is applied here rather than upstream because the spot
  // isn't known until the response arrives. Narrowing keeps the ATM search
  // honest on names with hundreds of listed strikes. fullDepth (the
  // simulator) wants the wider bracket — see SIMULATOR_STRIKE_BRACKET.
  const spot = underlyingPrice(first.results);
  if (spot === null) return first.results;

  const bracket = opts.fullDepth ? SIMULATOR_STRIKE_BRACKET : STRIKE_BRACKET;
  const lo = spot * (1 - bracket);
  const hi = spot * (1 + bracket);
  const inBracket = (r: RawContract) => {
    const k = r.details?.strike_price;
    return typeof k === "number" && k >= lo && k <= hi;
  };

  const byTicker = new Map<string, RawContract>();
  for (const r of first.results) {
    if (!inBracket(r)) continue;
    const t = r.details?.ticker;
    if (t) byTicker.set(t, r);
  }

  if (opts.fullDepth) {
    const depthUrl = new URL(`${MASSIVE_BASE}/v3/snapshot/options/${ticker}`);
    depthUrl.searchParams.set("expiration_date.gte", reportDate);
    depthUrl.searchParams.set("strike_price.gte", String(lo));
    depthUrl.searchParams.set("strike_price.lte", String(hi));
    depthUrl.searchParams.set("limit", "250");
    depthUrl.searchParams.set("sort", "expiration_date");
    depthUrl.searchParams.set("order", "asc");
    depthUrl.searchParams.set("apiKey", env.MASSIVE_API_KEY);

    const cutoff = addDaysIso(reportDate, CHAIN_MAX_DEPTH_DAYS);
    let nextUrl: string | null = depthUrl.toString();
    for (let page = 0; page < CHAIN_MAX_DEPTH_PAGES && nextUrl; page++) {
      const pageUrl = new URL(nextUrl);
      if (!pageUrl.searchParams.get("apiKey")) {
        pageUrl.searchParams.set("apiKey", env.MASSIVE_API_KEY);
      }
      const { results, nextUrl: next } = await fetchChainPage(env, pageUrl);
      let sawPastCutoff = false;
      for (const r of results) {
        const exp = r.details?.expiration_date;
        if (exp && exp > cutoff) {
          sawPastCutoff = true;
          continue;
        }
        if (!inBracket(r)) continue;
        const t = r.details?.ticker;
        if (t) byTicker.set(t, r);
      }
      if (sawPastCutoff) break;
      nextUrl = next;
    }
  }

  return [...byTicker.values()];
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/refresh") {
      return handleRefresh(request, env);
    }

    if (url.pathname === "/api/support") {
      return handleSupport(request, env);
    }

    if (url.pathname === "/api/chain") {
      return handleChain(request, env);
    }

    if (url.pathname === "/api/chart") {
      return handleChart(request, env, ctx);
    }

    if (url.pathname === "/api/indicators") {
      return handleIndicators(request, env, ctx);
    }

    if (url.pathname === "/api/lookup") {
      return handleLookup(request, env, ctx);
    }

    if (url.pathname === "/api/search") {
      return handleSearch(request, env, ctx);
    }

    if (url.pathname === "/api/financials") {
      return handleFinancials(request, env, ctx);
    }

    if (url.pathname === "/api/macro/cpi") {
      return handleCpiHistory(env, ctx);
    }

    if (url.pathname === "/api/insiders") {
      return handleInsiders(request, env, ctx);
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
