import { currentUser } from "@clerk/nextjs/server";
import { Navbar } from "@/components/navbar";
import { getSupabase } from "@/lib/supabase";
import { PLANS, type PlanId } from "@/lib/stripe";
import { BillingActions } from "@/components/billing-actions";

async function getSubscription(clerkUserId: string) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from("subscriptions")
    .select("plan, status, current_period_end, cancel_at_period_end")
    .eq("clerk_user_id", clerkUserId)
    .single();
  return data;
}

async function getWatchlistCount(clerkUserId: string) {
  const sb = getSupabase();
  if (!sb) return 0;
  const { count } = await sb
    .from("watchlist")
    .select("id", { count: "exact", head: true })
    .eq("clerk_user_id", clerkUserId);
  return count ?? 0;
}

export default async function DashboardPage() {
  const user = await currentUser();
  const clerkId = user?.id ?? "";

  const [sub, watchlistCount] = await Promise.all([
    getSubscription(clerkId),
    getWatchlistCount(clerkId),
  ]);

  const planId = (sub?.plan ?? "free") as PlanId;
  const plan = PLANS[planId] ?? PLANS.free;

  return (
    <main className="min-h-screen">
      <Navbar />
      <section className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-2xl font-semibold">
          Welcome{user?.firstName ? `, ${user.firstName}` : ""}.
        </h1>
        <p className="mt-2 opacity-70">
          Your Firmobase dashboard — manage your subscription and tracked companies.
        </p>

        {/* Stats */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-5">
            <div className="text-sm opacity-60">Companies tracked</div>
            <div className="mt-2 text-3xl font-semibold">{watchlistCount}</div>
            <div className="mt-1 text-xs opacity-40">
              {plan.limits.watchlistSize === -1
                ? "Unlimited"
                : `${watchlistCount} / ${plan.limits.watchlistSize}`}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-5">
            <div className="text-sm opacity-60">Current plan</div>
            <div className="mt-2 text-3xl font-semibold">{plan.name}</div>
            <div className="mt-1 text-xs opacity-40">
              {plan.price === 0 ? "Free forever" : `${plan.price} zł/month`}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-5">
            <div className="text-sm opacity-60">AI insights</div>
            <div className="mt-2 text-3xl font-semibold">
              {plan.limits.aiInsightsPerDay === -1 ? "∞" : plan.limits.aiInsightsPerDay}
            </div>
            <div className="mt-1 text-xs opacity-40">
              {plan.limits.aiInsightsPerDay === -1 ? "Unlimited" : "per day"}
            </div>
          </div>
        </div>

        {/* Subscription details */}
        <div className="mt-8 rounded-lg border border-[var(--border)] p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider opacity-50">
            Subscription
          </h2>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm">
                <span className="font-medium">{plan.name}</span>
                {sub?.status && sub.status !== "active" && (
                  <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
                    {sub.status}
                  </span>
                )}
                {sub?.cancel_at_period_end && (
                  <span className="ml-2 rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
                    Cancels at period end
                  </span>
                )}
              </p>
              {sub?.current_period_end && (
                <p className="mt-1 text-xs opacity-40">
                  Current period ends{" "}
                  {new Date(sub.current_period_end).toLocaleDateString("en-GB")}
                </p>
              )}
            </div>
            <BillingActions planId={planId} />
          </div>

          {/* Features */}
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider opacity-40">
              Your features
            </h3>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm opacity-60">
                  <span className="text-green-400">✓</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
