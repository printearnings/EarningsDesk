import { InfoTip } from "@/components/InfoTip";
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
            <dt className="text-sm text-[var(--color-body)]">
              {r.hint ? <InfoTip label={r.label} description={r.hint} /> : r.label}
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
    {
      label: "Market cap",
      value: moneyCompact(data.market_cap),
      hint: "Total market value of all outstanding shares — the most common measure of company size.",
    },
    {
      label: "Enterprise value",
      value: moneyCompact(data.enterprise_value),
      hint: "Market cap plus debt, minus cash — roughly what it would cost to buy the whole business.",
    },
    {
      label: "P/E (trailing)",
      value: num(data.trailing_pe),
      hint: "Price divided by the last 12 months of earnings per share — dollars paid per dollar of profit.",
    },
    {
      label: "P/E (forward)",
      value: num(data.forward_pe),
      hint: "Price divided by analysts' expected earnings for the next 12 months.",
    },
    {
      label: "PEG",
      value: num(data.peg_ratio),
      hint: "P/E relative to earnings growth. Around 1 is often read as fairly priced for the growth.",
    },
    {
      label: "P/B",
      value: num(data.price_to_book),
      hint: "Price relative to book value (assets minus liabilities) per share.",
    },
    {
      label: "P/S",
      value: num(data.price_to_sales),
      hint: "Price relative to the last 12 months of revenue per share.",
    },
  ];

  const profitability: Row[] = [
    {
      label: "ROE",
      value: pct(data.return_on_equity),
      hint: "Return on equity: profit as a percentage of shareholder equity — how efficiently equity becomes earnings.",
    },
    {
      label: "ROA",
      value: pct(data.return_on_assets),
      hint: "Return on assets: profit as a percentage of everything the company owns.",
    },
    {
      label: "Gross margin",
      value: pct(data.gross_margin),
      hint: "Revenue left after the direct cost of making the product.",
    },
    {
      label: "Operating margin",
      value: pct(data.operating_margin),
      hint: "Profit from core operations as a percentage of revenue.",
    },
    {
      label: "Profit margin",
      value: pct(data.profit_margin),
      hint: "Bottom-line profit as a percentage of revenue, after everything.",
    },
  ];

  const growth: Row[] = [
    {
      label: "Revenue growth",
      value: pct(data.revenue_growth),
      hint: "Revenue versus the same period a year ago.",
    },
    {
      label: "Earnings growth",
      value: pct(data.earnings_growth),
      hint: "Most recent quarter's earnings versus a year ago.",
    },
    {
      label: "EPS (trailing)",
      value: money(data.trailing_eps),
      hint: "Earnings per share over the last 12 months.",
    },
    {
      label: "EPS (forward)",
      value: money(data.forward_eps),
      hint: "Analysts' expected earnings per share for the next 12 months.",
    },
  ];

  const balance: Row[] = [
    {
      label: "Debt / equity",
      value: num(data.debt_to_equity),
      hint: "Total debt relative to shareholder equity; higher means more leverage. Reported as a percentage by the source.",
    },
    {
      label: "Current ratio",
      value: num(data.current_ratio),
      hint: "Current assets divided by current liabilities — short-term ability to cover bills. Above 1 is healthier.",
    },
    {
      label: "Quick ratio",
      value: num(data.quick_ratio),
      hint: "Like the current ratio but excluding inventory — a stricter liquidity check.",
    },
  ];

  const ownership: Row[] = [
    {
      label: "Insider ownership",
      value: pct(data.held_pct_insiders),
      hint: "Share of the company held by its own officers and directors.",
    },
    {
      label: "Institutional ownership",
      value: pct(data.held_pct_institutions),
      // Genuinely exceeds 100% for heavily-shorted names: a lent share is
      // counted for both the original holder and its buyer. Real, not a
      // reporting error — but it reads as one without saying so.
      hint: "Share held by funds and institutions. Can exceed 100% when shares are lent out for shorting and counted twice.",
    },
    {
      label: "Shares outstanding",
      value: compact(data.shares_outstanding),
      hint: "Total shares issued and held by all owners.",
    },
    {
      label: "Float",
      value: compact(data.float_shares),
      hint: "Shares actually available to trade — outstanding minus insider and restricted holdings.",
    },
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
    {
      label: "Beta",
      value: num(data.beta),
      hint: "How much the stock moves relative to the market. Above 1 = more volatile than the market.",
    },
    {
      label: "52-week high",
      value: money(data.fifty_two_week_high),
      hint: "Highest price over the past year.",
    },
    {
      label: "52-week low",
      value: money(data.fifty_two_week_low),
      hint: "Lowest price over the past year.",
    },
    {
      label: "Dividend yield",
      value: pct(data.dividend_yield),
      hint: "Annual dividend as a percentage of the current share price.",
    },
    {
      label: "Payout ratio",
      value: pct(data.payout_ratio),
      hint: "Share of earnings paid out as dividends.",
    },
  ];

  const analysts: Row[] = [
    {
      label: "Mean price target",
      value: money(data.target_mean_price),
      hint: "Average of analysts' 12-month price targets.",
    },
    {
      label: "Consensus rating",
      value: num(data.recommendation_mean),
      hint: "Average analyst rating, 1-5 — lower is more bullish.",
    },
    {
      label: "Analysts covering",
      value: num(data.number_of_analysts, 0),
      hint: "How many analysts publish ratings on this stock.",
    },
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
