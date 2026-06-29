"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";

export function WatchlistButton({ companyId }: { companyId: string }) {
  const { isSignedIn } = useUser();
  const [watched, setWatched] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isSignedIn) return;
    fetch("/api/watchlist")
      .then((r) => r.json())
      .then((d) => {
        const items = d.items ?? [];
        setWatched(items.some((i: { company_id: string }) => i.company_id === companyId));
      })
      .catch(() => {});
  }, [isSignedIn, companyId]);

  const toggle = async () => {
    if (!isSignedIn) {
      window.location.href = "/sign-in";
      return;
    }

    setLoading(true);
    try {
      if (watched) {
        await fetch(`/api/watchlist?companyId=${companyId}`, { method: "DELETE" });
        setWatched(false);
      } else {
        await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId }),
        });
        setWatched(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-all ${
        watched
          ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
          : "border-[var(--border)] hover:bg-[var(--muted)]"
      } disabled:opacity-40`}
    >
      {loading ? "..." : watched ? "Watching" : "Watch"}
    </button>
  );
}
