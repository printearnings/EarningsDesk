import { DisclaimerGate } from "@/components/DisclaimerGate";
import { Footer } from "@/components/Footer";
import { TopNav } from "@/components/TopNav";
import { getIndex } from "@/lib/api";

/**
 * App shell: a sticky global top nav above a scrolling content column.
 *
 * The route group `(app)` doesn't appear in URLs — it exists purely so the
 * landing page at / can opt out of this chrome. Every page inside supplies its
 * own TopBar (its title), because only the page knows it. The nav fetches the
 * ticker index once here so its search works on every page.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const index = await getIndex();

  return (
    <div className="flex min-h-screen flex-col">
      <DisclaimerGate />
      <TopNav tickers={index.tickers} />
      {/* Cap the content width: with the sidebar gone, an uncapped column let
          full-width SVG charts (which scale their own fonts by width) blow up
          on wide screens. This keeps the reading measure and the charts sane. */}
      <div className="mx-auto flex w-full max-w-[1320px] min-w-0 flex-1 flex-col">
        {children}
        <Footer />
      </div>
    </div>
  );
}
