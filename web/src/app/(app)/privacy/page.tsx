import { Panel } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import { getIndex } from "@/lib/api";

export const metadata = { title: "Privacy | PrintEarnings" };

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

        <Panel title="Cookies">
          <p className="max-w-3xl text-[var(--color-body)]">
            This site sets exactly one cookie:{" "}
            <code className="text-[var(--color-heading)]">cf_clearance</code>, placed by
            Cloudflare (which sits in front of every request) for bot and abuse mitigation. It
            is not used for analytics, advertising, or tracking you across sites, and nothing
            here reads or acts on it. Cookies used strictly for security, like this one, are the
            standard exemption in cookie-consent law (GDPR/ePrivacy, CCPA-style regimes), so the
            Accept/Reject choice on the banner has nothing to actually turn off today.
            It&rsquo;s there so the choice is on record, and so there&rsquo;s something real to
            gate the day this site adds anything that isn&rsquo;t strictly necessary.
          </p>
        </Panel>

        <Panel title="What's stored in your browser">
          <p className="max-w-3xl text-[var(--color-body)]">
            A few preferences live in local storage, never sent to any server: whether
            you&rsquo;ve acknowledged the{" "}
            <a href="/disclaimer/" className="underline underline-offset-2">
              disclaimer
            </a>
            , your cookie-banner choice, your light/dark theme, and whether the sidebar is
            collapsed. Clearing your browser&rsquo;s site data resets all of them.
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
