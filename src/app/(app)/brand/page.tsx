import { listLeads, sentimentSeries } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { parseList } from "@/lib/util";
import { Empty, LeadRow, PageHeader } from "@/components/ui";
import { SentimentChart } from "@/components/sentiment-chart";

export const dynamic = "force-dynamic";

export default async function BrandPage() {
  const settings = await getSettings();
  const [brandSeries, compSeries, brand, comp] = await Promise.all([
    sentimentSeries("BRAND", 14),
    sentimentSeries("COMPETITOR", 14),
    listLeads({ kind: "BRAND", status: "ALL", take: 30 }),
    listLeads({ kind: "COMPETITOR", status: "ALL", take: 30 }),
  ]);
  const competitors = parseList(settings.competitors);

  return (
    <>
      <PageHeader
        title="Brand & competitors"
        sub={`Mentions of ${settings.brandName || "your brand"}${competitors.length ? ` and ${competitors.length} competitors` : ""}, with sentiment.`}
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <SentimentChart data={brandSeries} title={`${settings.brandName || "Brand"} sentiment`} />
        <SentimentChart data={compSeries} title="Competitor sentiment" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-medium">Brand mentions</h2>
          {brand.leads.length ? (
            <ul className="card divide-y divide-hairline">
              {brand.leads.map((l) => (
                <LeadRow key={l.id} lead={l} showMonitor={false} />
              ))}
            </ul>
          ) : (
            <Empty title="No brand mentions yet" hint="Add a BRAND monitor with your brand's names." />
          )}
        </section>
        <section>
          <h2 className="mb-2 text-sm font-medium">Competitor mentions</h2>
          {comp.leads.length ? (
            <ul className="card divide-y divide-hairline">
              {comp.leads.map((l) => (
                <LeadRow key={l.id} lead={l} showMonitor={false} />
              ))}
            </ul>
          ) : (
            <Empty title="No competitor mentions yet" hint="Add a COMPETITOR monitor with competitor names." />
          )}
        </section>
      </div>
    </>
  );
}
