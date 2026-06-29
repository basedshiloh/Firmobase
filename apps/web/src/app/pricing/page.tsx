"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Navbar } from "@/components/navbar";
import { PLANS, type PlanId } from "@/lib/stripe";

const PRICE_IDS: Partial<Record<PlanId, string>> = {
  pro: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID ?? "",
  enterprise: process.env.NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID ?? "",
};

export default function PricingPage() {
  const { isSignedIn } = useUser();
  const [loading, setLoading] = useState<PlanId | null>(null);

  const handleSubscribe = async (planId: PlanId) => {
    if (planId === "free") return;
    if (!isSignedIn) {
      window.location.href = "/sign-in?redirect_url=/pricing";
      return;
    }

    const priceId = PRICE_IDS[planId];
    if (!priceId) return;

    setLoading(planId);
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkout", priceId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } finally {
      setLoading(null);
    }
  };

  return (
    <main className="min-h-screen">
      <Navbar />
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Choose your plan</h1>
          <p className="mt-2 text-sm opacity-50">
            All plans include full access to Polish company registry data.
            Upgrade for AI insights, exports, and API access.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {(Object.values(PLANS) as typeof PLANS[PlanId][]).map((plan) => {
            const isPopular = plan.id === "pro";
            return (
              <div
                key={plan.id}
                className={`relative rounded-xl border p-6 ${
                  isPopular
                    ? "border-[var(--primary)] shadow-lg shadow-[var(--primary)]/10"
                    : "border-[var(--border)]"
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--primary)] px-3 py-0.5 text-xs font-semibold text-white">
                    Most popular
                  </div>
                )}

                <h2 className="text-lg font-semibold">{plan.name}</h2>
                <div className="mt-2">
                  <span className="text-3xl font-bold">
                    {plan.price === 0 ? "Free" : `${plan.price} zł`}
                  </span>
                  {plan.price > 0 && (
                    <span className="text-sm opacity-40"> /month</span>
                  )}
                </div>

                <ul className="mt-6 space-y-2.5">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm opacity-70"
                    >
                      <span className="mt-0.5 text-green-400">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={plan.id === "free" || loading !== null}
                  className={`mt-8 w-full rounded-lg py-2.5 text-sm font-medium transition-opacity ${
                    plan.id === "free"
                      ? "border border-[var(--border)] opacity-50"
                      : isPopular
                        ? "bg-[var(--primary)] text-white hover:opacity-90"
                        : "border border-[var(--border)] hover:bg-[var(--muted)]"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {loading === plan.id
                    ? "Redirecting..."
                    : plan.id === "free"
                      ? "Current plan"
                      : `Subscribe to ${plan.name}`}
                </button>

                {plan.id !== "free" && (
                  <p className="mt-2 text-center text-[10px] opacity-30">
                    Supports cards, BLIK, Przelewy24
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs opacity-30">
          Prices in PLN, VAT included. Cancel anytime from your billing portal.
        </p>
      </section>
    </main>
  );
}
