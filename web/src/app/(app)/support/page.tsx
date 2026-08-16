import { Panel } from "@/components/Panel";
import { SupportForm } from "@/components/SupportForm";
import { TopBar } from "@/components/TopBar";
import { getIndex } from "@/lib/api";

export const metadata = { title: "Support | PrintEarnings" };

export default async function SupportPage() {
  const index = await getIndex();

  return (
    <>
      <TopBar title="Support" eyebrow="Contact us" tickers={index.tickers} />

      <div className="px-6 py-6">
        <Panel title="Get in touch" bodyClassName="px-0 py-0">
          <SupportForm />
        </Panel>
      </div>
    </>
  );
}
