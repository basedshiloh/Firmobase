"use client";

import { useEffect, useState } from "react";

type Insights = {
  summary: string;
  risk_flags: string[];
  strengths: string[];
  financial_narrative: string | null;
  outlook: string;
};

type InsightsResponse = {
  insights: Insights;
  model?: string;
  generatedAt: string;
};

export function AiInsights({ companyId }: { companyId: string }) {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const generate = () => {
    setLoading(true);
    setError(null);
    fetch(`/api/insights?companyId=${companyId}`)
      .then((r) => {
        if (!r.ok) return r.json().then((d) => Promise.reject(d.error ?? "Failed"));
        return r.json();
      })
      .then((d: InsightsResponse) => {
        setData(d);
        setExpanded(true);
      })
      .catch((e) => setError(typeof e === "string" ? e : "Could not generate insights"))
      .finally(() => setLoading(false));
  };

  return (
    <div className="rounded-lg border border-[var(--border)] p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider opacity-50">
          AI Insights
        </h2>
        {!data && !loading && (
          <button
            onClick={generate}
            className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            Generate analysis
          </button>
        )}
        {data && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs opacity-40 hover:opacity-70"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        )}
      </div>

      {loading && (
        <div className="mt-4 flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
          <span className="text-sm opacity-50">Analyzing company data with AI...</span>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md bg-red-500/10 p-3 text-sm text-red-400">
          {error}
          <button
            onClick={generate}
            className="ml-2 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {!data && !loading && !error && (
        <p className="mt-2 text-xs opacity-30">
          Get an AI-powered summary, risk flags, and financial narrative for this company.
        </p>
      )}

      {data && expanded && <InsightsPanel insights={data.insights} model={data.model} generatedAt={data.generatedAt} />}
    </div>
  );
}

function InsightsPanel({
  insights,
  model,
  generatedAt,
}: {
  insights: Insights;
  model?: string;
  generatedAt: string;
}) {
  return (
    <div className="mt-4 space-y-4">
      {/* Summary */}
      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider opacity-40">
          Summary
        </h3>
        <p className="text-sm leading-relaxed opacity-80">{insights.summary}</p>
      </div>

      {/* Strengths & Risks side by side */}
      <div className="grid gap-4 sm:grid-cols-2">
        {insights.strengths.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-green-400">
              Strengths
            </h3>
            <ul className="space-y-1">
              {insights.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm opacity-70">
                  <span className="mt-0.5 text-green-400">+</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {insights.risk_flags.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-amber-400">
              Risk flags
            </h3>
            <ul className="space-y-1">
              {insights.risk_flags.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm opacity-70">
                  <span className="mt-0.5 text-amber-400">!</span>
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Financial narrative */}
      {insights.financial_narrative && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider opacity-40">
            Financial narrative
          </h3>
          <p className="text-sm leading-relaxed opacity-80">
            {insights.financial_narrative}
          </p>
        </div>
      )}

      {/* Outlook */}
      {insights.outlook && (
        <div className="rounded-md bg-[var(--muted)] p-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider opacity-40">
            Outlook
          </h3>
          <p className="text-sm leading-relaxed opacity-80">{insights.outlook}</p>
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] opacity-25">
        <span>Powered by {model ?? "AI"} via OpenRouter · Not financial advice</span>
        <span>Generated {new Date(generatedAt).toLocaleString()}</span>
      </div>
    </div>
  );
}
