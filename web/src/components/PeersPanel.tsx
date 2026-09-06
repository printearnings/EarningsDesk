import Link from "next/link";

import { CompanyLogo } from "@/components/CompanyLogo";
import { Panel } from "@/components/Panel";
import type { PeerEarnings } from "@/lib/types";
import { formatDateShort, money, pctSigned, sessionLabel } from "@/lib/format";

/**
 * How similar-product peers' most recent prints landed — the price into the
 * report and the reaction after — so someone sizing up this name's upcoming
 * earnings can see the recent environment for its cohort. Rendered only when
 * peers with usable recent-earnings data exist (the server drops the list
 * otherwise), so this component never has to explain an empty state.
 */
export function PeersPanel({ peers }: { peers: PeerEarnings[] }) {
  return (
    <Panel title="How peers' last earnings landed">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {peers.map((peer) => (
          <PeerCard key={peer.ticker} peer={peer} />
        ))}
      </ul>
    </Panel>
  );
}

function PeerCard({ peer }: { peer: PeerEarnings }) {
  const up = peer.move >= 0;
  const session = sessionLabel(peer.session);
  const moveColor = up ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]";

  return (
    <li className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel-soft)] px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/t/${peer.ticker}/`}
          className="flex min-w-0 items-center gap-2 underline-offset-2 hover:underline"
        >
          <CompanyLogo ticker={peer.ticker} domain={peer.company_domain} size={20} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-[var(--color-heading)]">
              {peer.ticker}
            </span>
            {peer.company_name && (
              <span className="text-2xs block truncate text-[var(--color-muted)]">
                {peer.company_name}
              </span>
            )}
          </span>
        </Link>
        <span className={`tnum shrink-0 text-sm font-semibold ${moveColor}`}>
          {pctSigned(peer.move)}
        </span>
      </div>

      <div className="mt-2.5 flex items-baseline gap-1.5 text-sm">
        <span className="tnum text-[var(--color-muted)]">{money(peer.price_before)}</span>
        <span className="text-[var(--color-muted)]" aria-hidden>
          →
        </span>
        <span className={`tnum font-medium ${moveColor}`}>{money(peer.price_after)}</span>
      </div>

      <p className="text-2xs mt-1 text-[var(--color-muted)]">
        Reported {formatDateShort(peer.report_date)}
        {session ? ` · ${session}` : ""}
      </p>
    </li>
  );
}
