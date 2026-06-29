import { getSupabase } from "@/lib/supabase";
import { FinancialChart, type FinancialChartPoint } from "./financial-chart";
import { FinancialAnalysis } from "./financial-analysis";
import type { ReportFigures } from "@/lib/analytics";

type Report = {
  id: string;
  fiscal_year: number;
  period_start: string | null;
  period_end: string | null;
  consolidated: boolean;
  currency: string | null;
  original_format: string | null;
  revenue: number | null;
  operating_profit: number | null;
  net_profit: number | null;
  total_assets: number | null;
  total_equity: number | null;
  total_liabilities: number | null;
  cash: number | null;
};

type LineItem = {
  report_id: string;
  statement: string;
  label: string;
  value: number | null;
  prev_value: number | null;
  depth: number | null;
  ordinal: number | null;
};

const STATEMENT_LABELS: Record<string, string> = {
  balance_sheet: "Balance sheet",
  profit_loss: "Profit & loss",
  cash_flow: "Cash flow",
  equity_changes: "Changes in equity",
  notes: "Notes",
};

async function fetchReports(companyId: string): Promise<Report[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("financial_reports")
    .select(
      "id, fiscal_year, period_start, period_end, consolidated, currency, original_format, revenue, operating_profit, net_profit, total_assets, total_equity, total_liabilities, cash",
    )
    .eq("company_id", companyId)
    .order("fiscal_year", { ascending: false });
  return (data ?? []) as Report[];
}

async function fetchLatestLineItems(reportId: string): Promise<LineItem[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("financial_line_items")
    .select("report_id, statement, label, value, prev_value, depth, ordinal")
    .eq("report_id", reportId)
    .order("ordinal");
  return (data ?? []) as LineItem[];
}

function fmt(value: number | null, currency = "PLN"): string {
  if (value == null) return "—";
  return `${Number(value).toLocaleString("pl-PL")} ${currency}`;
}

function growth(curr: number | null, prev: number | null): string | null {
  if (curr == null || prev == null || prev === 0) return null;
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

export async function CompanyFinancials({ companyId }: { companyId: string }) {
  const reports = await fetchReports(companyId);

  if (reports.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--border)] p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider opacity-50">
          Financials
        </h2>
        <p className="text-sm opacity-50">
          No financial statements ingested yet. They are scraped from the eKRS
          financial document repository (RDF).
        </p>
      </div>
    );
  }

  const latest = reports[0];
  const prior = reports[1];
  const lineItems = await fetchLatestLineItems(latest.id);

  // chart data, chronological
  const chartData: FinancialChartPoint[] = [...reports]
    .reverse()
    .map((r) => ({
      year: r.fiscal_year,
      revenue: r.revenue != null ? Number(r.revenue) : null,
      netProfit: r.net_profit != null ? Number(r.net_profit) : null,
    }));

  const metrics: { label: string; value: number | null; prev: number | null }[] = [
    { label: "Revenue", value: latest.revenue, prev: prior?.revenue ?? null },
    { label: "Net profit", value: latest.net_profit, prev: prior?.net_profit ?? null },
    { label: "Total assets", value: latest.total_assets, prev: prior?.total_assets ?? null },
    { label: "Equity", value: latest.total_equity, prev: prior?.total_equity ?? null },
  ];

  // group line items by statement
  const byStatement = lineItems.reduce<Record<string, LineItem[]>>((acc, li) => {
    (acc[li.statement] ??= []).push(li);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[var(--border)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider opacity-50">
            Financials · FY{latest.fiscal_year}
            {latest.consolidated ? " (consolidated)" : ""}
          </h2>
          <span className="text-xs opacity-40">
            {reports.length} year{reports.length !== 1 ? "s" : ""} on file
          </span>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {metrics.map((m) => {
            const g = growth(m.value, m.prev);
            const positive = g?.startsWith("+");
            return (
              <div
                key={m.label}
                className="rounded-md bg-[var(--muted)] p-3"
              >
                <div className="text-xs opacity-50">{m.label}</div>
                <div className="mt-1 text-lg font-semibold">
                  {fmt(m.value, latest.currency ?? "PLN")}
                </div>
                {g && (
                  <div
                    className={`mt-0.5 text-xs ${positive ? "text-green-400" : "text-red-400"}`}
                  >
                    {g} YoY
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Chart */}
        {chartData.length > 1 && (
          <div className="mt-6">
            <FinancialChart data={chartData} />
          </div>
        )}
      </div>

      {/* Analysis — ratios + indicative scores */}
      <FinancialAnalysis reports={reports as ReportFigures[]} />

      {/* Detailed statements */}
      {Object.entries(byStatement).map(([statement, items]) => (
        <details
          key={statement}
          className="rounded-lg border border-[var(--border)] p-5"
          open={statement === "balance_sheet"}
        >
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wider opacity-50">
            {STATEMENT_LABELS[statement] ?? statement} · FY{latest.fiscal_year}
          </summary>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider opacity-40">
                <th className="pb-2 text-left font-medium">Position</th>
                <th className="pb-2 text-right font-medium">{latest.fiscal_year}</th>
                <th className="pb-2 text-right font-medium">{latest.fiscal_year - 1}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((li, i) => (
                <tr
                  key={`${li.report_id}-${i}`}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td
                    className="py-1.5"
                    style={{ paddingLeft: `${(li.depth ?? 0) * 16}px` }}
                  >
                    <span className={li.depth === 0 ? "font-medium" : "opacity-70"}>
                      {li.label}
                    </span>
                  </td>
                  <td className="py-1.5 text-right font-mono text-xs">
                    {li.value != null
                      ? Number(li.value).toLocaleString("pl-PL")
                      : "—"}
                  </td>
                  <td className="py-1.5 text-right font-mono text-xs opacity-50">
                    {li.prev_value != null
                      ? Number(li.prev_value).toLocaleString("pl-PL")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
    </div>
  );
}
