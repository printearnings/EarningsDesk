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

        <Panel title="A couple of other things">
          <p className="max-w-3xl text-[var(--color-body)]">
            Cloudflare, which hosts this site, logs standard request info the way any web host
            does; this project doesn&rsquo;t use those logs for anything. A couple of actions
            (refreshing live data, searching a ticker) are briefly limited by IP address to keep
            costs sane. Company logos load a small image from Google.
          </p>
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
