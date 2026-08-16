import { Panel } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import { getIndex } from "@/lib/api";

export const metadata = { title: "Privacy — EarningsDesk" };

export default async function PrivacyPage() {
  const index = await getIndex();

  return (
    <>
      <TopBar
        title="Privacy"
        eyebrow="What we collect (short answer: almost nothing)"
        tickers={index.tickers}
      />

      <div className="space-y-6 px-6 py-6">
        <Panel title="No accounts, no tracking">
          <p className="max-w-3xl text-[var(--color-body)]">
            There&rsquo;s no sign-up, no login, and no analytics or advertising script on this
            site — nothing that profiles you or follows you elsewhere. Every page here is either
            served from a pre-built static file or a same-origin API call; nothing is sold or
            shared.
          </p>
        </Panel>

        <Panel title="What's stored in your browser">
          <p className="max-w-3xl text-[var(--color-body)]">
            Two small preferences live in your browser&rsquo;s local storage, never sent to any
            server: whether you&rsquo;ve acknowledged the{" "}
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
              server information (IP address, user agent, requested path) the way any host does
              — this project doesn&rsquo;t query or export those logs for anything.
            </p>
            <p>
              The &ldquo;refresh live data&rdquo; and ticker-search actions are rate-limited per
              IP address to keep the underlying data costs sane. That means your IP is held
              briefly (keyed by the hour, expiring automatically within about 65 minutes) purely
              to count requests — not logged, profiled, or kept beyond that window.
            </p>
            <p>
              Company logos load from Google&rsquo;s public favicon service, which means your
              browser makes a direct request to Google for that image — the one third-party
              request this site causes your browser to make on its own.
            </p>
          </div>
        </Panel>

        <Panel title="Questions">
          <p className="max-w-3xl text-[var(--color-body)]">
            This is a small, independently-run project, not a company with a privacy team — if
            something here is unclear, the honest answer is usually just what&rsquo;s written
            above.
          </p>
        </Panel>
      </div>
    </>
  );
}
