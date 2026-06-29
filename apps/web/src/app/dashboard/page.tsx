import { currentUser } from "@clerk/nextjs/server";
import { Navbar } from "@/components/navbar";
import { getSupabase } from "@/lib/supabase";

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
  const watchlistCount = await getWatchlistCount(clerkId);

  return (
    <main className="min-h-screen">
      <Navbar />
      <section className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-2xl font-semibold">
          Welcome{user?.firstName ? `, ${user.firstName}` : ""}.
        </h1>
        <p className="mt-2 opacity-70">
          Your Firmobase dashboard — track and monitor Polish companies.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-5">
            <div className="text-sm opacity-60">Companies tracked</div>
            <div className="mt-2 text-3xl font-semibold">{watchlistCount}</div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-5">
            <div className="text-sm opacity-60">Saved searches</div>
            <div className="mt-2 text-3xl font-semibold">0</div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-5">
            <div className="text-sm opacity-60">Active alerts</div>
            <div className="mt-2 text-3xl font-semibold">0</div>
          </div>
        </div>
      </section>
    </main>
  );
}
