/**
 * Financial analytics engine.
 *
 * Pure functions that turn raw annual figures (from `financial_reports`) into
 * ratios, growth metrics and indicative 0–100 scores. Scores are transparent,
 * heuristic composites — documented inline — not regulated credit ratings.
 *
 * All inputs may be null (statements vary); every output is null-safe.
 */

export type ReportFigures = {
  fiscal_year: number;
  revenue: number | null;
  operating_profit: number | null;
  net_profit: number | null;
  total_assets: number | null;
  total_equity: number | null;
  total_liabilities: number | null;
  cash: number | null;
};

export type Ratios = {
  netMargin: number | null; // net profit / revenue
  operatingMargin: number | null; // operating profit / revenue
  roe: number | null; // net profit / equity
  roa: number | null; // net profit / assets
  debtRatio: number | null; // liabilities / assets
  equityRatio: number | null; // equity / assets
  cashToLiabilities: number | null; // cash / liabilities
};

export type Growth = {
  revenueYoY: number | null;
  netProfitYoY: number | null;
  assetsYoY: number | null;
  equityYoY: number | null;
  revenueCagr: number | null; // across all available years
};

export type Scores = {
  health: number | null; // composite overall
  profitability: number | null;
  stability: number | null;
  growth: number | null;
  credit: number | null; // creditworthiness (higher = lower risk)
};

export type Analysis = {
  latestYear: number;
  ratios: Ratios;
  growth: Growth;
  scores: Scores;
};

const div = (a: number | null, b: number | null): number | null =>
  a == null || b == null || b === 0 ? null : a / b;

/** Linear-scale a value into 0–100, clamped. */
function scale(value: number | null, min: number, max: number): number | null {
  if (value == null) return null;
  const pct = ((value - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, pct));
}

/** Weighted average of (score, weight) pairs, ignoring null scores. */
function weighted(parts: [number | null, number][]): number | null {
  let sum = 0;
  let w = 0;
  for (const [s, weight] of parts) {
    if (s != null) {
      sum += s * weight;
      w += weight;
    }
  }
  return w === 0 ? null : Math.round(sum / w);
}

export function computeRatios(r: ReportFigures): Ratios {
  return {
    netMargin: div(r.net_profit, r.revenue),
    operatingMargin: div(r.operating_profit, r.revenue),
    roe: div(r.net_profit, r.total_equity),
    roa: div(r.net_profit, r.total_assets),
    debtRatio: div(r.total_liabilities, r.total_assets),
    equityRatio: div(r.total_equity, r.total_assets),
    cashToLiabilities: div(r.cash, r.total_liabilities),
  };
}

/** `reports` may be in any order; we sort ascending by year internally. */
export function computeGrowth(reports: ReportFigures[]): Growth {
  const sorted = [...reports].sort((a, b) => a.fiscal_year - b.fiscal_year);
  if (sorted.length < 2) {
    return {
      revenueYoY: null,
      netProfitYoY: null,
      assetsYoY: null,
      equityYoY: null,
      revenueCagr: null,
    };
  }
  const latest = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  const first = sorted[0];

  const yoy = (cur: number | null, old: number | null): number | null =>
    cur == null || old == null || old === 0 ? null : (cur - old) / Math.abs(old);

  let revenueCagr: number | null = null;
  const years = latest.fiscal_year - first.fiscal_year;
  if (years > 0 && first.revenue && latest.revenue && first.revenue > 0) {
    revenueCagr = (latest.revenue / first.revenue) ** (1 / years) - 1;
  }

  return {
    revenueYoY: yoy(latest.revenue, prev.revenue),
    netProfitYoY: yoy(latest.net_profit, prev.net_profit),
    assetsYoY: yoy(latest.total_assets, prev.total_assets),
    equityYoY: yoy(latest.total_equity, prev.total_equity),
    revenueCagr,
  };
}

export function computeScores(ratios: Ratios, growth: Growth): Scores {
  // Profitability: margins + returns. Strong company: ~30% margin, ~25% ROE.
  const profitability = weighted([
    [scale(ratios.netMargin, 0, 0.3), 0.4],
    [scale(ratios.roe, 0, 0.25), 0.3],
    [scale(ratios.roa, 0, 0.15), 0.3],
  ]);

  // Stability: high equity ratio + low leverage.
  const debtInverse =
    ratios.debtRatio == null ? null : 100 - (scale(ratios.debtRatio, 0, 0.7) ?? 0);
  const stability = weighted([
    [scale(ratios.equityRatio, 0.2, 0.8), 0.5],
    [debtInverse, 0.5],
  ]);

  // Growth: revenue + profit momentum (−20%..+30% mapped to 0..100).
  const growthScore = weighted([
    [scale(growth.revenueYoY, -0.2, 0.3), 0.5],
    [scale(growth.netProfitYoY, -0.3, 0.4), 0.5],
  ]);

  // Credit: weighted toward solvency + profitability + cash cover.
  const credit = weighted([
    [stability, 0.5],
    [profitability, 0.3],
    [scale(ratios.cashToLiabilities, 0, 1), 0.2],
  ]);

  // Overall health: balanced composite.
  const health = weighted([
    [profitability, 0.4],
    [stability, 0.35],
    [growthScore, 0.25],
  ]);

  return { health, profitability, stability, growth: growthScore, credit };
}

export function analyzeFinancials(reports: ReportFigures[]): Analysis | null {
  if (reports.length === 0) return null;
  const sorted = [...reports].sort((a, b) => b.fiscal_year - a.fiscal_year);
  const latest = sorted[0];
  const ratios = computeRatios(latest);
  const growth = computeGrowth(reports);
  const scores = computeScores(ratios, growth);
  return { latestYear: latest.fiscal_year, ratios, growth, scores };
}

// ── formatting helpers (used by the UI) ─────────────────────────────────────

export function pct(value: number | null, digits = 1): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function scoreColor(score: number | null): string {
  if (score == null) return "var(--border)";
  if (score >= 70) return "#22c55e"; // green
  if (score >= 45) return "#eab308"; // amber
  return "#ef4444"; // red
}

export function scoreLabel(score: number | null): string {
  if (score == null) return "N/A";
  if (score >= 80) return "Excellent";
  if (score >= 65) return "Strong";
  if (score >= 45) return "Moderate";
  if (score >= 30) return "Weak";
  return "Poor";
}
