"use client";

import { useState } from "react";
import type { PlanId } from "@/lib/stripe";

export function BillingActions({ planId }: { planId: PlanId }) {
  const [loading, setLoading] = useState(false);

  const openPortal = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "portal" }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } finally {
      setLoading(false);
    }
  };

  if (planId === "free") {
    return (
      <a
        href="/pricing"
        className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Upgrade plan
      </a>
    );
  }

  return (
    <button
      onClick={openPortal}
      disabled={loading}
      className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--muted)] disabled:opacity-40"
    >
      {loading ? "Loading..." : "Manage billing"}
    </button>
  );
}
