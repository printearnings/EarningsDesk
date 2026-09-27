import Link from "next/link";

import { VerdictChip } from "@/components/Chip";
import { Panel } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import { getHowWeScore, getIndex } from "@/lib/api";
import type { ScoredExample, ScoredLeg } from "@/lib/api";
import { formatDate, formatDateShort, pctRange, pctSigned, sessionLabel } from "@/lib/format";

export const metadata = {
  title: "How calls are tested | PrintEarnings",
  description:
    "Every RICH or CHEAP call is scored as if one defined-risk options structure had been traded around the report. Two real examples, step by step.",
};

/**
 * "How calls are tested": the rules the track record applies, then two real
 * scored trades worked through step by step, the most recent of each kind,
 * whichever way it went (repo.scored_examples). It answers "how would I
 * actually turn a row into a trade?" by showing how one is tested, without
 * telling anyone what to place.
 */
export default async function HowWeScorePage() {
  const [index, data] = await Promise.all([getIndex(), getHowWeScore()]);

  return (
    <>
      <TopBar title="How calls are tested" eyebrow="Methodology" tickers={index.tickers} />

      <div className="space-y-6 px-6 py-6">
        <Panel>
          <div className="max-w-3xl space-y-3 text-[var(--color-body)]">
            <p className="text-lg">
              Every RICH or CHEAP call is scored as if one defined-risk options structure had
              been traded around the report, at real option prices. That&rsquo;s what the{" "}
              <Link href="/track-record/" className="text-[var(--color-brand)] hover:underline">
                track record
              </Link>{" "}
              adds up.
            </p>
            <p>
              Below are the rules, then two real scored trades worked through step by step: the
              most recent of each kind, whichever way it went. It&rsquo;s how the record is
              built, not a recommendation of what to trade.
            </p>
          </div>
        </Panel>

        <Panel title="The rules">
          <ol className="max-w-3xl list-decimal space-y-3 pl-5 text-[var(--color-body)] marker:font-mono marker:text-[var(--color-brand)]">
            <li>
              <strong className="text-[var(--color-heading)]">
                The structure follows the call.
              </strong>{" "}
              RICH (options pricing a bigger move than usual) is scored as an{" "}
              <em>iron condor</em>: sell a call and a put about one standard move out (16
              delta), and buy a further-out call and put (7 delta) that cap the loss. CHEAP is
              scored as a <em>long straddle</em>: buy the at-the-money call and put. Both are
              defined-risk: the most you can lose is known when you open them.
            </li>
            <li>
              <strong className="text-[var(--color-heading)]">
                The expiry right after the report.
              </strong>{" "}
              The first expiry after the print, and only if it&rsquo;s within a week of it. A
              later expiry prices weeks of ordinary volatility on top of the report, so those
              calls aren&rsquo;t scored at all.
            </li>
            <li>
              <strong className="text-[var(--color-heading)]">
                In the day before, out the day after.
              </strong>{" "}
              Opened at the close the session before the report. Closed at the close of the
              first session that trades on the news: the report day itself for a before-the-open
              report, the next day for an after-the-close one.
            </li>
            <li>
              <strong className="text-[var(--color-heading)]">
                Real prices, one contract per leg.
              </strong>{" "}
              Each option&rsquo;s actual closing price on those two days. Real fills can be
              worse, especially on thinly traded chains; a trade whose strikes weren&rsquo;t all
              quoted is left out rather than guessed at.
            </li>
            <li>
              <strong className="text-[var(--color-heading)]">
                Scored against what was at risk.
              </strong>{" "}
              The result is the profit or loss as a share of the maximum loss. Selling and
              buying are reported separately, never blended.
            </li>
          </ol>
        </Panel>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Example
            title="A RICH call, scored as an iron condor"
            example={data.sell}
            empty="No priced RICH trade to show yet."
          />
          <Example
            title="A CHEAP call, scored as a long straddle"
            example={data.buy}
            empty="No priced CHEAP trade to show yet."
          />
        </div>

        <Panel title="Reading a structure card yourself">
          <ul className="max-w-3xl list-disc space-y-2 pl-5 text-[var(--color-body)]">
            <li>
              <strong className="text-[var(--color-heading)]">
                Max loss is fixed at the open.
              </strong>{" "}
              A condor can lose at most its widest wing minus the credit collected. A straddle
              can lose at most what it cost.
            </li>
            <li>
              <strong className="text-[var(--color-heading)]">
                The breakevens are the whole bet.
              </strong>{" "}
              A condor needs the stock to finish between its breakevens; a straddle needs it to
              finish outside them.
            </li>
            <li>
              <strong className="text-[var(--color-heading)]">
                Implied volatility falls after the report.
              </strong>{" "}
              Option prices drop once the news is out (&ldquo;IV crush&rdquo;). That&rsquo;s
              what a condor collects, and why a straddle can lose money even when the stock
              moves.
            </li>
            <li>
              The{" "}
              <Link href="/simulator/" className="text-[var(--color-brand)] hover:underline">
                simulator
              </Link>{" "}
              and each ticker&rsquo;s Options tab lay out these numbers for any upcoming report.
            </li>
          </ul>
          <p className="mt-5 border-t border-[var(--color-border-subtle)] pt-4 text-sm text-[var(--color-muted)]">
            Past results are a sample, not a promise, and options can lose their full cost. This
            page explains how the site tests its reads; it isn&rsquo;t financial advice or a
            recommendation to trade.
          </p>
        </Panel>
      </div>
    </>
  );
}

const TYPE_LETTER: Record<string, string> = { call: "C", put: "P" };

function money(v: number, digits = 2): string {
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(digits)}`;
}

function perContract(v: number): string {
  return `${v < 0 ? "-" : ""}$${Math.abs(v * 100).toFixed(0)}`;
}

function widestWing(legs: ScoredLeg[]): number | null {
  const widths = (["put", "call"] as const).map((t) => {
    const ks = legs.filter((l) => l.type === t).map((l) => l.strike);
    return ks.length === 2 ? Math.abs(ks[0] - ks[1]) : null;
  });
  const valid = widths.filter((w): w is number => w !== null);
  return valid.length ? Math.max(...valid) : null;
}

function breakevens(ex: ScoredExample): [number, number] | null {
  if (ex.entry == null) return null;
  const premium = Math.abs(ex.entry);
  if (ex.structure === "iron_condor") {
    const shortPut = ex.legs.find((l) => l.action === "sell" && l.type === "put");
    const shortCall = ex.legs.find((l) => l.action === "sell" && l.type === "call");
    return shortPut && shortCall
      ? [shortPut.strike - premium, shortCall.strike + premium]
      : null;
  }
  if (ex.structure === "long_straddle") {
    // The legs are the call and put nearest 50 delta, which can sit on
    // neighbouring strikes: each breakeven is off its own leg.
    const put = ex.legs.find((l) => l.type === "put");
    const call = ex.legs.find((l) => l.type === "call");
    return put && call ? [put.strike - premium, call.strike + premium] : null;
  }
  return null;
}

function Example({
  title,
  example: ex,
  empty,
}: {
  title: string;
  example: ScoredExample | null | undefined;
  empty: string;
}) {
  if (!ex) return <Panel title={title} empty={empty} />;

  const selling = ex.side === "sell";
  const premium = ex.entry != null ? Math.abs(ex.entry) : null;
  const wing = widestWing(ex.legs);
  const be = breakevens(ex);
  const multiple =
    ex.implied_move != null && ex.hist_avg_move ? ex.implied_move / ex.hist_avg_move : null;
  const won = (ex.pnl_pct ?? 0) > 0;
  const session = sessionLabel(ex.report_session);

  return (
    <Panel
      title={title}
      subtitle={`${ex.ticker}, reported ${formatDate(ex.report_date)}${session ? ` ${session}` : ""}`}
      action={
        ex.pnl_pct != null ? (
          <span
            className={`rounded-[4px] border px-2 py-0.5 font-mono text-xs font-semibold ${
              won
                ? "border-[var(--color-positive)]/40 text-[var(--color-positive)]"
                : "border-[var(--color-negative)]/40 text-[var(--color-negative)]"
            }`}
          >
            {won ? "Won" : "Lost"} {pctSigned(ex.pnl_pct)}
          </span>
        ) : undefined
      }
    >
      <ol className="space-y-5">
        <Step n={1} title="The read">
          Options priced a move of{" "}
          <span className="tnum font-mono font-semibold">{pctRange(ex.implied_move)}</span>{" "}
          against a typical{" "}
          <span className="tnum font-mono font-semibold">{pctRange(ex.hist_avg_move)}</span>
          {multiple !== null && ` (${multiple.toFixed(1)}× usual)`}, so the call was{" "}
          <VerdictChip verdict={ex.verdict} />.
        </Step>

        <Step
          n={2}
          title={`The structure, opened at the close on ${formatDateShort(ex.entry_date)}`}
        >
          <div className="mt-2 overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--color-border)]">
            <table className="tnum w-full min-w-[26rem] font-mono text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-table-head)] text-left text-[10px] tracking-[0.08em] text-[var(--color-muted)] uppercase">
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Option</th>
                  <th className="px-3 py-2 font-medium">Expiry</th>
                  <th className="px-3 py-2 text-right font-medium">In</th>
                  <th className="px-3 py-2 text-right font-medium">Out</th>
                </tr>
              </thead>
              <tbody>
                {ex.legs.map((l, i) => (
                  <tr
                    key={i}
                    className="border-b border-[var(--color-border-subtle)] last:border-b-0"
                  >
                    <td
                      className={`px-3 py-2 font-semibold uppercase ${
                        l.action === "sell"
                          ? "text-[var(--color-verdict-rich)]"
                          : "text-[var(--color-verdict-cheap)]"
                      }`}
                    >
                      {l.action}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-heading)]">
                      {l.strike}
                      {TYPE_LETTER[l.type] ?? ""}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-muted)]">
                      {formatDateShort(l.expiry)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {l.entry != null ? money(l.entry) : ""}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {l.exit != null ? money(l.exit) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ex.structure === "long_straddle" &&
            new Set(ex.legs.map((l) => l.strike)).size > 1 && (
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                The call and put closest to at-the-money sat on neighbouring strikes here, so
                each side&rsquo;s breakeven is measured from its own strike.
              </p>
            )}
        </Step>

        <Step n={3} title="What was at stake">
          {premium !== null &&
            (selling ? (
              <>
                Collected <strong>{money(premium)}</strong> a share ({perContract(premium)} per
                contract).
                {wing !== null && ex.capital != null && (
                  <>
                    {" "}
                    The widest wing is {money(wing, 0)} wide, so the most it could lose was{" "}
                    <strong>{money(ex.capital)}</strong> a share ({perContract(ex.capital)}).
                  </>
                )}
              </>
            ) : (
              <>
                Paid <strong>{money(premium)}</strong> a share ({perContract(premium)} per
                contract). That&rsquo;s also the most it could lose.
              </>
            ))}
          {be && (
            <>
              {" "}
              {selling
                ? "It profits if the stock finishes between"
                : "It needs the stock to finish outside"}{" "}
              <span className="tnum font-mono font-semibold">{money(be[0])}</span> and{" "}
              <span className="tnum font-mono font-semibold">{money(be[1])}</span>.
            </>
          )}
        </Step>

        <Step n={4} title={`What happened, closed on ${formatDateShort(ex.exit_date)}`}>
          {ex.realized_move != null ? (
            <>
              The stock moved{" "}
              <span className="tnum font-mono font-semibold">
                {pctSigned(ex.realized_move)}
              </span>{" "}
              on the report.{" "}
            </>
          ) : (
            "The close-to-close move isn't on file for this print. "
          )}
          {ex.exit != null && ex.pnl_per_share != null && ex.capital != null && (
            <>
              {selling
                ? `Buying it back cost ${money(Math.abs(ex.exit))} a share, so it `
                : `The two options were then worth ${money(Math.abs(ex.exit))} a share, so it `}
              {ex.pnl_per_share >= 0 ? (selling ? "kept" : "made") : "lost"}{" "}
              <strong>{money(Math.abs(ex.pnl_per_share))}</strong> a share (
              {perContract(Math.abs(ex.pnl_per_share))} per contract):{" "}
              <strong
                className={
                  (ex.pnl_pct ?? 0) > 0
                    ? "text-[var(--color-positive)]"
                    : "text-[var(--color-negative)]"
                }
              >
                {pctSigned(ex.pnl_pct)}
              </strong>{" "}
              of the {money(ex.capital)} at risk.
            </>
          )}
        </Step>
      </ol>

      <p className="mt-5 border-t border-[var(--color-border-subtle)] pt-4 text-xs text-[var(--color-muted)]">
        The most recent scored trade of this kind, shown win or lose. One trade says little on
        its own; the{" "}
        <Link href="/track-record/" className="text-[var(--color-brand)] hover:underline">
          track record
        </Link>{" "}
        has all of them.
      </p>
    </Panel>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--color-brand)]/40 bg-[var(--color-brand)]/10 font-mono text-xs font-bold text-[var(--color-brand)]">
        {n}
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-[var(--color-heading)]">{title}</p>
        <div className="mt-1 text-[var(--color-body)]">{children}</div>
      </div>
    </li>
  );
}
