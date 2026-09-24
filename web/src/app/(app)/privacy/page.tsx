import { Panel } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import { getIndex } from "@/lib/api";

export const metadata = { title: "Privacy | PrintEarnings" };

export default async function PrivacyPage() {
  const index = await getIndex();

  return (
    <>
      <TopBar title="Privacy" eyebrow="No accounts · ad-supported" tickers={index.tickers} />

      <div className="space-y-6 px-6 py-6">
        <Panel title="No accounts">
          <p className="max-w-3xl text-[var(--color-body)]">
            No sign-up, no login, and no analytics script. Every page is served from a pre-built
            static file or a same-origin API call. The site is supported by ads from Google
            AdSense, described below. This project does not sell your personal information.
          </p>
        </Panel>

        <Panel title="Advertising (Google AdSense)">
          <div className="max-w-3xl space-y-3 text-[var(--color-body)]">
            <p>
              Ads on this site are served by Google AdSense. Third-party vendors, including
              Google, use cookies to serve ads based on your prior visits to this website or
              other websites. Google&rsquo;s use of advertising cookies enables it and its
              partners to serve ads to you based on your visit to this site and/or other sites
              on the Internet.
            </p>
            <p>
              You can opt out of personalized advertising in{" "}
              <a
                href="https://adssettings.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                Google&rsquo;s Ads Settings
              </a>
              , and opt out of some third-party vendors&rsquo; use of cookies for personalized
              advertising at{" "}
              <a
                href="https://www.aboutads.info/choices/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                aboutads.info
              </a>
              . For how Google uses this information, see{" "}
              <a
                href="https://policies.google.com/technologies/partner-sites"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                How Google uses information from sites that use its services
              </a>
              .
            </p>
            <p>
              Choosing &ldquo;Reject non-essential&rdquo; on this site&rsquo;s cookie banner
              limits the ads here to non-personalized ones. Google may still use cookies for
              non-personalized ads, for things like frequency capping, fraud prevention, and
              aggregate ad reporting.
            </p>
          </div>
        </Panel>

        <Panel title="Cookies">
          <p className="max-w-3xl text-[var(--color-body)]">
            Cloudflare, which sits in front of every request, sets{" "}
            <code className="text-[var(--color-heading)]">cf_clearance</code> for bot and abuse
            mitigation. That is strictly necessary for security and isn&rsquo;t used for
            advertising. Google AdSense sets advertising cookies as described above. Your
            Accept/Reject choice on the cookie banner controls whether the ads here can be
            personalized.
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
