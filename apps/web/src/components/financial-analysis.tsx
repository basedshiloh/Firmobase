import {
  analyzeFinancials,
  pct,
  type ReportFigures,
} from "@/lib/analytics";
import { ScoreRing } from "./score-ring";

/** Renders ratios + indicative scores from the supplied annual reports. */
export function FinancialAnalysis({ reports }: { reports: ReportFigures[] }) {
  const analysis = analyzeFinancials(reports);
  if (!analysis) return null;

  const { ratios, growth, scores, latestYear } = analysis;

  const ratioRows: { label: string; value: string; hint?: string }[] = [
    { label: "Net margin", value: pct(ratios.netMargin) },
    { label: "Operating margin", value: pct(ratios.operatingMargin) },
    { label: "ROE", value: pct(ratios.roe), hint: "Return on equity" },
    { label: "ROA", value: pct(ratios.roa), hint: "Return on assets" },
    { label: "Debt ratio", value: pct(ratios.debtRatio), hint: "Liabilities / assets" },
    { label: "Equity ratio", value: pct(ratios.equityRatio), hint: "Equity / assets" },
  ];

  const growthRows: { label: string; value: number | null }[] = [
    { label: "Revenue YoY", value: growth.revenueYoY },
    { label: "Net profit YoY", value: growth.netProfitYoY },
    { label: "Assets YoY", value: growth.assetsYoY },
    { label: "Revenue CAGR", value: growth.revenueCagr },
  ];

  return (
    <div className="rounded-lg border border-[var(--border)] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider opacity-50">
          Financial analysis · FY{latestYear}
        </h2>
        <span className="text-[10px] uppercase tracking-wider opacity-30">
          indicative scores
        </span>
      </div>

      {/* Scores */}
      <div className="flex flex-wrap justify-between gap-4">
        <ScoreRing score={scores.health} label="Health" size={84} />
        <ScoreRing score={scores.profitability} label="Profitability" />
        <ScoreRing score={scores.stability} label="Stability" />
        <ScoreRing score={scores.growth} label="Growth" />
        <ScoreRing score={scores.credit} label="Credit" />
      </div>

      {/* Ratios + growth */}
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider opacity-40">
            Key ratios
          </h3>
          <dl className="space-y-1.5 text-sm">
            {ratioRows.map((r) => (
              <div key={r.label} className="flex items-center justify-between">
                <dt className="opacity-60" title={r.hint}>
                  {r.label}
                </dt>
                <dd className="font-mono">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider opacity-40">
            Growth
          </h3>
          <dl className="space-y-1.5 text-sm">
            {growthRows.map((r) => {
              const positive = r.value != null && r.value >= 0;
              return (
                <div key={r.label} className="flex items-center justify-between">
                  <dt className="opacity-60">{r.label}</dt>
                  <dd
                    className={`font-mono ${
                      r.value == null
                        ? ""
                        : positive
                          ? "text-green-400"
                          : "text-red-400"
                    }`}
                  >
                    {r.value == null ? "—" : `${positive ? "+" : ""}${pct(r.value)}`}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      </div>

      <p className="mt-4 text-[10px] leading-relaxed opacity-30">
        Scores are indicative composites derived from filed financial figures
        (profitability, leverage, growth) — not regulated credit ratings.
      </p>
    </div>
  );
}
