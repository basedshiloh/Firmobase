"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Navbar } from "@/components/navbar";

type Stats = {
  counts: Record<string, number>;
  plans: Record<string, number>;
  recent_ingestions: {
    id: string;
    status: string;
    source: string;
    started_at: string;
  }[];
  timestamp: string;
};

export default function AdminPage() {
  const { isSignedIn } = useUser();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSignedIn) return;
    fetch("/api/admin/stats")
      .then((r) => {
        if (r.status === 403) throw new Error("Access denied — admin only");
        if (!r.ok) throw new Error("Failed to load stats");
        return r.json();
      })
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [isSignedIn]);

  if (!isSignedIn) {
    return (
      <main className="min-h-screen">
        <Navbar />
        <section className="mx-auto max-w-5xl px-6 py-12">
          <p className="opacity-50">Sign in to access the admin panel.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Navbar />
      <section className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Admin Panel</h1>
        <p className="mt-1 text-sm opacity-50">Platform overview and monitoring</p>

        {loading && (
          <div className="mt-8 flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
            <span className="text-sm opacity-50">Loading stats...</span>
          </div>
        )}

        {error && (
          <div className="mt-8 rounded-lg border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-400">
            {error}
          </div>
        )}

        {stats && (
          <>
            {/* Data counts */}
            <div className="mt-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {Object.entries(stats.counts).map(([key, value]) => (
                <div
                  key={key}
                  className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-4"
                >
                  <div className="text-xs uppercase tracking-wider opacity-40">
                    {key.replace(/_/g, " ")}
                  </div>
                  <div className="mt-1 text-2xl font-semibold">
                    {value.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            {/* Subscription breakdown */}
            <div className="mt-8 rounded-lg border border-[var(--border)] p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider opacity-50">
                Subscriptions by plan
              </h2>
              <div className="grid gap-4 sm:grid-cols-3">
                {Object.entries(stats.plans).map(([plan, count]) => (
                  <div key={plan} className="rounded-md bg-[var(--muted)] p-3">
                    <div className="text-xs uppercase opacity-40">{plan}</div>
                    <div className="mt-1 text-xl font-semibold">{count}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent ingestion runs */}
            <div className="mt-8 rounded-lg border border-[var(--border)] p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider opacity-50">
                Recent ingestion runs
              </h2>
              {stats.recent_ingestions.length === 0 ? (
                <p className="text-sm opacity-40">No ingestion runs yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider opacity-40">
                        <th className="pb-2 font-medium">Source</th>
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium">Started</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recent_ingestions.map((run) => (
                        <tr
                          key={run.id}
                          className="border-b border-[var(--border)] last:border-0"
                        >
                          <td className="py-2 pr-4 font-mono text-xs">
                            {run.source}
                          </td>
                          <td className="py-2 pr-4">
                            <StatusBadge status={run.status} />
                          </td>
                          <td className="py-2 font-mono text-xs opacity-50">
                            {new Date(run.started_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="mt-4 text-[10px] opacity-25">
              Last refreshed: {new Date(stats.timestamp).toLocaleString()}
            </p>
          </>
        )}
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: "bg-green-500/10 text-green-400",
    success: "bg-green-500/10 text-green-400",
    pending: "bg-blue-500/10 text-blue-400",
    running: "bg-blue-500/10 text-blue-400",
    failed: "bg-red-500/10 text-red-400",
    error: "bg-red-500/10 text-red-400",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        colors[status] ?? "bg-[var(--muted)] opacity-60"
      }`}
    >
      {status}
    </span>
  );
}
