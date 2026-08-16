import { Panel } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import { getIndex } from "@/lib/api";

export const metadata = { title: "Privacy | EarningsDesk" };

export default async function PrivacyPage() {
  const index = await getIndex();

  return (
    <>
      <TopBar title="Privacy" eyebrow="Data collected: minimal" tickers={index.tickers} />

      <div className="space-y-6 px-6 py-6">
        <Panel title="No accounts, no tracking">
          <p className="max-w-3xl text-[var(--color-body)]">
            No sign-up, no login, no analytics or advertising script. Nothing profiles you or
            follows you elsewhere. Every page is served from a pre-built static file or a
            same-origin API call. Nothing is sold or shared.
          </p>
        </Panel>

        <Panel title="What's stored in your browser">
          <p className="max-w-3xl text-[var(--color-body)]">
            Two preferences live in local storage, never sent to any server: whether
            you&rsquo;ve acknowledged the{" "}
            <a href="/disclaimer/" className="underline underline-offset-2">
              disclaimer
            </a>
            , and whether the sidebar is collapsed. Clearing your browser&rsquo;s site data
            resets both.
          </p>
        </Panel>

        <Panel title="What touches a server">
          <div className="max-w-3xl space-y-3 text-[var(--color-body)]">
            <p>
              Every request reaches Cloudflare&rsquo;s edge network, which logs standard web
              server information (IP address, user agent, requested path) as any host does. This
              project does not query or export those logs.
            </p>
            <p>
              The &ldquo;refresh live data&rdquo; and ticker-search actions are rate-limited per
              IP address to control data costs. Your IP is held briefly for that count, keyed by
              the hour and expiring automatically within about 65 minutes. Not logged, profiled,
              or retained beyond that window.
            </p>
            <p>
              Company logos load from Google&rsquo;s public favicon service. Your browser makes
              a direct request to Google for that image, the one third-party request this site
              causes your browser to make on its own.
            </p>
          </div>
        </Panel>

        <Panel title="Questions">
          <p className="max-w-3xl text-[var(--color-body)]">
            This is a small, independently-run project. What is written above is the complete
            answer.
          </p>
        </Panel>
      </div>
    </>
  );
}
