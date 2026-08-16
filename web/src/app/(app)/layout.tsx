import { DisclaimerGate } from "@/components/DisclaimerGate";
import { Sidebar } from "@/components/Sidebar";

/**
 * App shell: persistent sidebar beside a scrolling content column.
 *
 * The route group `(app)` doesn't appear in URLs — it exists purely so the
 * landing page at / can opt out of this chrome. Every page inside supplies its
 * own TopBar, because only the page knows its title.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <DisclaimerGate />
      <Sidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
