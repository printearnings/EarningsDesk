import { Panel } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import { getIndex } from "@/lib/api";

export const metadata = { title: "Terms of Service | PrintEarnings" };

/**
 * Scoped to what this site actually is: no accounts, no trade execution, no
 * custody of funds. A broker-dealer's terms cover account opening, margin,
 * order routing, SIPC coverage, and arbitration — none of that applies here,
 * and reusing that template would overstate what this site does. Deliberately
 * NOT including a governing-law/arbitration clause; that's the one section
 * that genuinely wants a lawyer's sign-off before it says something specific.
 */
export default async function TermsPage() {
  const index = await getIndex();

  return (
    <>
      <TopBar title="Terms of Service" eyebrow="The short version" tickers={index.tickers} />

      <div className="space-y-6 px-6 py-6">
        <Panel title="What this is">
          <p className="max-w-3xl text-[var(--color-body)]">
            PrintEarnings is a free, informational tool. There are no accounts, no trade
            execution, and no custody of funds or securities. Using this site never moves money.
            By using it, you agree to these terms; if you don&rsquo;t agree, don&rsquo;t use the
            site.
          </p>
        </Panel>

        <Panel title="Acceptable use">
          <p className="max-w-3xl text-[var(--color-body)]">
            Use the site for personal, non-commercial research. Don&rsquo;t scrape,
            bulk-download, or republish its data as your own product or feed; don&rsquo;t
            attempt to bypass rate limits, probe the infrastructure, or interfere with the
            service for other users. The live-refresh and search endpoints are rate-limited per
            IP for exactly this reason.
          </p>
        </Panel>

        <Panel title="No warranty">
          <p className="max-w-3xl text-[var(--color-body)]">
            The site and its data are provided &ldquo;as is,&rdquo; with no warranty of
            accuracy, completeness, or availability. Prices, options data, and financials come
            from third-party providers and can be delayed, incomplete, or wrong. See the{" "}
            <a href="/disclaimer/" className="underline underline-offset-2">
              Disclaimer
            </a>{" "}
            for how that shapes what you should trust. The site can go down, change, or be
            discontinued without notice.
          </p>
        </Panel>

        <Panel title="Limitation of liability">
          <p className="max-w-3xl text-[var(--color-body)]">
            Nothing on this site is investment advice, and no one connected to it is liable for
            trading losses or decisions made using it. Use it at your own risk, and verify
            anything that matters before acting on it.
          </p>
        </Panel>

        <Panel title="Changes">
          <p className="max-w-3xl text-[var(--color-body)]">
            These terms can change as the site does. Continuing to use the site after a change
            means you accept the update, so check back here if you want to know what
            you&rsquo;re agreeing to.
          </p>
        </Panel>
      </div>
    </>
  );
}
