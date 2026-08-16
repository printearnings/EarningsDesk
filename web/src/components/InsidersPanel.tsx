"use client";

import { useMemo, useState } from "react";

import { Panel } from "@/components/Panel";
import { Pagination } from "@/components/Pagination";
import { EMPTY, formatDateShort, money, moneyCompact, compact } from "@/lib/format";
import { useInsiders, type InsiderTransaction } from "@/lib/useInsiders";

const PAGE_SIZE = 10;

// The rest is administrative — RSU tax withholding, option exercises,
// scheduled grants — and reads as "insider activity" without being the
// discretionary buy/sell decision a reader actually means by that phrase.
// P/S are the two codes where a real person chose, today, to trade the
// stock on the open market.
const OPEN_MARKET_CODES = new Set(["P", "S"]);

const TRANSACTION_CODE_LABEL: Record<string, string> = {
  P: "Open-market purchase",
  S: "Open-market sale",
  A: "Grant / award",
  M: "Option exercise",
  F: "Tax withholding",
  G: "Gift",
  C: "Conversion",
  D: "Disposition to issuer",
  X: "Option expired",
  J: "Other",
};

function codeLabel(code: string | null): string {
  if (!code) return "Unknown";
  return TRANSACTION_CODE_LABEL[code] ?? code;
}

function roleLabel(t: InsiderTransaction): string | null {
  const roles: string[] = [];
  if (t.is_officer) roles.push(t.officer_title || "Officer");
  if (t.is_director) roles.push("Director");
  if (t.is_ten_percent_owner) roles.push("10% owner");
  return roles.length > 0 ? roles.join(" · ") : null;
}

/**
 * SEC Form 4 insider transactions — the officers, directors, and 10%+
 * owners who bought or sold shares, filed within two business days of the
 * trade. Data comes from Massive's form-4 endpoint (filtered by CIK, which
 * the Worker resolves from the ticker; Massive doesn't filter this endpoint
 * by ticker directly).
 *
 * Defaults to open-market trades only (codes P/S) — a discretionary buy or
 * sell decision is what "insider activity" means to a reader, not an RSU
 * vesting's routine tax withholding. Both are one toggle away from each
 * other, never hidden, just not the default.
 */
export function InsidersPanel({ ticker }: { ticker: string }) {
  const { data, loading } = useInsiders(ticker);
  const [openMarketOnly, setOpenMarketOnly] = useState(true);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!openMarketOnly) return data.transactions;
    return data.transactions.filter(
      (t) => t.transaction_code && OPEN_MARKET_CODES.has(t.transaction_code),
    );
  }, [data, openMarketOnly]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const resetKey = openMarketOnly ? "open" : "all";
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setPage(1);
  }

  return (
    <Panel
      subtitle="Officers, directors, and 10%+ owners buying or selling shares — filed within two business days of the trade"
      bodyClassName="px-0 py-0"
      empty={
        !loading && data && data.transactions.length === 0
          ? "No Form 4 filings found for this symbol."
          : undefined
      }
    >
      {loading ? (
        <p className="px-5 py-8 text-sm text-[var(--color-muted)]">Loading…</p>
      ) : (
        data &&
        data.transactions.length > 0 && (
          <div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-[var(--color-border)] px-5 py-4">
              <div className="inline-flex rounded-[var(--radius-sm)] border border-[var(--color-border)] p-0.5">
                {[
                  { key: true, label: "Open-market only" },
                  { key: false, label: "All filings" },
                ].map((opt) => (
                  <button
                    key={String(opt.key)}
                    type="button"
                    onClick={() => setOpenMarketOnly(opt.key)}
                    aria-pressed={openMarketOnly === opt.key}
                    className={`pressable rounded-[3px] px-2.5 py-1 text-sm font-medium transition-colors ${
                      openMarketOnly === opt.key
                        ? "bg-[var(--color-panel-soft)] text-[var(--color-heading)]"
                        : "text-[var(--color-muted)] hover:bg-[var(--color-panel-soft)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <span className="text-2xs ml-auto text-[var(--color-muted)]">
                {filtered.length} of {data.transactions.length} filings
              </span>
            </div>

            {filtered.length === 0 ? (
              <p className="px-5 py-8 text-sm text-[var(--color-muted)]">
                No open-market trades in the filings on record. Try &ldquo;All filings&rdquo; to
                see grants, withholding, and exercises too.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="tnum w-full min-w-[52rem] text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] bg-[var(--color-panel-soft)] text-left">
                        {[
                          "Date",
                          "Insider",
                          "Type",
                          "Shares",
                          "Price",
                          "Value",
                          "Owned after",
                          "",
                        ].map((h) => (
                          <th key={h} className="eyebrow px-3 py-2.5 font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map((t, i) => {
                        const role = roleLabel(t);
                        const acquired = t.acquired_or_disposed === "A";
                        return (
                          <tr
                            key={`${t.filing_date}-${t.owner_name}-${i}`}
                            className="border-b border-[var(--color-border-subtle)] last:border-b-0"
                          >
                            <td className="px-3 py-2.5 whitespace-nowrap text-[var(--color-body)]">
                              {formatDateShort(t.transaction_date)}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <div className="font-medium text-[var(--color-heading)]">
                                {t.owner_name ?? EMPTY}
                              </div>
                              {role && (
                                <div className="text-2xs text-[var(--color-muted)]">{role}</div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <span
                                className={
                                  acquired
                                    ? "text-[var(--color-positive)]"
                                    : "text-[var(--color-negative)]"
                                }
                              >
                                {acquired ? "Acquired" : "Disposed"}
                              </span>
                              <div className="text-2xs text-[var(--color-muted)]">
                                {codeLabel(t.transaction_code)}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              {t.shares !== null ? compact(t.shares) : EMPTY}
                            </td>
                            <td className="px-3 py-2.5">
                              {t.price_per_share !== null ? money(t.price_per_share) : EMPTY}
                            </td>
                            <td className="px-3 py-2.5">
                              {t.value !== null ? moneyCompact(t.value) : EMPTY}
                            </td>
                            <td className="px-3 py-2.5">
                              {t.shares_owned_after !== null
                                ? compact(t.shares_owned_after)
                                : EMPTY}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              {t.filing_url && (
                                <a
                                  href={t.filing_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[var(--color-body)] underline-offset-4 hover:text-[var(--color-heading)] hover:underline"
                                >
                                  Filing ↗
                                </a>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={filtered.length}
                  onPageChange={setPage}
                />
              </>
            )}
          </div>
        )
      )}
    </Panel>
  );
}
