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
      <div className="flex min-w-0 flex-1 flex-col">
        {children}
        <Footer />
      </div>
    </div>
  );
}
