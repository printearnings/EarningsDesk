import { Panel } from "@/components/Panel";
import { EMPTY, compact, money, moneyCompact, num, pct } from "@/lib/format";
import type { Fundamentals } from "@/lib/types";

/**
 * The company ratio grid — valuation, profitability, balance sheet,
 * ownership — the business context an options setup sits on top of.
 *
 * A dense label/value grid rather than stat cards: there are ~30 figures
 * here and giving each its own bordered tile would bury the page. This is
 * reference data you scan for one number, not headline metrics.
 *
 * Every value is optional and renders blank when absent: a company with
 * no dividend genuinely has no payout ratio, and that reads very
 * differently from a payout ratio of zero.
 */

interface Row {
  label: string;
  value: string;
  hint?: string;
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  // A section whose every value is missing is noise: drop it rather than
  // render a column of blanks (common for ADRs and recent IPOs).
  if (rows.every((r) => r.value === EMPTY)) return null;

  return (
    // break-inside-avoid keeps a section whole inside the multi-column
    // flow — without it a 7-row block can split across a column boundary
    // and orphan its last rows under the wrong heading.
    <div className="mb-6 break-inside-avoid">
      <p className="eyebrow mb-2 text-[var(--color-muted)]">{title}</p>
      <dl className="divide-y divide-[var(--color-border-subtle)]">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3 py-1.5">
            <dt
              className={`text-sm text-[var(--color-body)] ${
                r.hint ? "decoration-dotted underline-offset-2 hover:underline" : ""
              }`}
              title={r.hint}
            >
              {r.label}
            </dt>
            <dd className="tnum text-sm font-medium text-[var(--color-heading)]">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function FundamentalsGrid({ data }: { data: Fundamentals | null | undefined }) {
  if (!data) {
    return <Panel title="Key figures" empty="No fundamentals available for this symbol." />;
  }

  const valuation: Row[] = [
    { label: "Market cap", value: moneyCompact(data.market_cap) },
    { label: "Enterprise value", value: moneyCompact(data.enterprise_value) },
    { label: "P/E (trailing)", value: num(data.trailing_pe) },
    { label: "P/E (forward)", value: num(data.forward_pe) },
    { label: "PEG", value: num(data.peg_ratio), hint: "P/E relative to growth." },
    { label: "P/B", value: num(data.price_to_book) },
    { label: "P/S", value: num(data.price_to_sales) },
  ];

  const profitability: Row[] = [
    { label: "ROE", value: pct(data.return_on_equity) },
    { label: "ROA", value: pct(data.return_on_assets) },
    { label: "Gross margin", value: pct(data.gross_margin) },
    { label: "Operating margin", value: pct(data.operating_margin) },
    { label: "Profit margin", value: pct(data.profit_margin) },
  ];

  const growth: Row[] = [
    { label: "Revenue growth", value: pct(data.revenue_growth), hint: "Year over year." },
    {
      label: "Earnings growth",
      value: pct(data.earnings_growth),
      hint: "Most recent quarter, year over year.",
    },
    { label: "EPS (trailing)", value: money(data.trailing_eps) },
    { label: "EPS (forward)", value: money(data.forward_eps) },
  ];

  const balance: Row[] = [
    {
      label: "Debt / equity",
      value: num(data.debt_to_equity),
      hint: "Reported as a percentage by the source.",
    },
    { label: "Current ratio", value: num(data.current_ratio) },
    { label: "Quick ratio", value: num(data.quick_ratio) },
  ];

  const ownership: Row[] = [
    { label: "Insider ownership", value: pct(data.held_pct_insiders) },
    {
      label: "Institutional ownership",
      value: pct(data.held_pct_institutions),
      // Genuinely exceeds 100% for heavily-shorted names: a lent share is
      // counted for both the original holder and its buyer. Real, not a
      // reporting error — but it reads as one without saying so.
      hint: "Can exceed 100% when shares are lent out for shorting and counted twice.",
    },
    { label: "Shares outstanding", value: compact(data.shares_outstanding) },
    { label: "Float", value: compact(data.float_shares) },
    {
      label: "Short % of float",
      value: pct(data.short_pct_of_float),
      hint: "Higher = more crowded on the short side; a squeeze risk into a print.",
    },
    {
      label: "Short ratio",
      value: num(data.short_ratio),
      hint: "Days of average volume needed to cover the short interest.",
    },
  ];

  const trading: Row[] = [
    { label: "Beta", value: num(data.beta), hint: "Volatility relative to the market." },
    { label: "52-week high", value: money(data.fifty_two_week_high) },
    { label: "52-week low", value: money(data.fifty_two_week_low) },
    { label: "Dividend yield", value: pct(data.dividend_yield) },
    { label: "Payout ratio", value: pct(data.payout_ratio) },
  ];

  const analysts: Row[] = [
    { label: "Mean price target", value: money(data.target_mean_price) },
    {
      label: "Consensus rating",
      value: num(data.recommendation_mean),
      hint: "1-5, lower is more bullish.",
    },
    { label: "Analysts covering", value: num(data.number_of_analysts, 0) },
  ];

  return (
    <Panel title="Key figures">
      {/* Multi-column, not a grid: sections have wildly different row
          counts (7 vs 3), and a grid sizes every row to its tallest member,
          which left ragged holes under the short ones. Columns let each
          section pack against the previous one. */}
      <div className="columns-1 gap-x-10 sm:columns-2 xl:columns-3 [&>*:last-child]:mb-0">
        <Section title="Valuation" rows={valuation} />
        <Section title="Profitability" rows={profitability} />
        <Section title="Growth" rows={growth} />
        <Section title="Balance sheet" rows={balance} />
        <Section title="Ownership & float" rows={ownership} />
        <Section title="Trading" rows={trading} />
        <Section title="Analyst consensus" rows={analysts} />
      </div>
    </Panel>
  );
}
