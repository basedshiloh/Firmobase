"use client";

import {
  Bar,
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type FinancialChartPoint = {
  year: number;
  revenue: number | null;
  netProfit: number | null;
};

function formatPLN(value: number): string {
  if (Math.abs(value) >= 1_000_000_000)
    return `${(value / 1_000_000_000).toFixed(1)} mld`;
  if (Math.abs(value) >= 1_000_000)
    return `${(value / 1_000_000).toFixed(1)} mln`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)} tys`;
  return value.toLocaleString("pl-PL");
}

export function FinancialChart({ data }: { data: FinancialChartPoint[] }) {
  if (data.length === 0) return null;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="year"
            stroke="var(--foreground)"
            tick={{ fontSize: 12, opacity: 0.6 }}
            tickLine={false}
          />
          <YAxis
            stroke="var(--foreground)"
            tick={{ fontSize: 11, opacity: 0.5 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatPLN(v)}
            width={50}
          />
          <Tooltip
            contentStyle={{
              background: "var(--background)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => [
              `${Number(value).toLocaleString("pl-PL")} PLN`,
              name === "revenue" ? "Revenue" : "Net profit",
            ]}
          />
          <Bar
            dataKey="revenue"
            fill="var(--primary)"
            fillOpacity={0.25}
            radius={[4, 4, 0, 0]}
            name="revenue"
          />
          <Line
            type="monotone"
            dataKey="netProfit"
            stroke="#22c55e"
            strokeWidth={2}
            dot={{ r: 3 }}
            name="netProfit"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
