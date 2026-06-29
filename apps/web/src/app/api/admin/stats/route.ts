import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "@/lib/supabase";

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS ?? "").split(",").filter(Boolean);

export async function GET() {
  const { userId } = await auth();
  if (!userId || !ADMIN_USER_IDS.includes(userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }

  const [
    companies,
    persons,
    reports,
    grants,
    subscriptions,
    watchlist,
    ingestionRuns,
  ] = await Promise.all([
    sb.from("companies").select("id", { count: "exact", head: true }),
    sb.from("persons").select("id", { count: "exact", head: true }),
    sb.from("financial_reports").select("id", { count: "exact", head: true }),
    sb.from("grants").select("id", { count: "exact", head: true }),
    sb.from("subscriptions").select("id, plan", { count: "exact" }),
    sb.from("watchlist").select("id", { count: "exact", head: true }),
    sb
      .from("ingestion_runs")
      .select("id, status, source, started_at")
      .order("started_at", { ascending: false })
      .limit(20),
  ]);

  const subData = subscriptions.data ?? [];
  const planBreakdown = {
    free: subData.filter((s) => s.plan === "free").length,
    pro: subData.filter((s) => s.plan === "pro").length,
    enterprise: subData.filter((s) => s.plan === "enterprise").length,
  };

  return NextResponse.json({
    counts: {
      companies: companies.count ?? 0,
      persons: persons.count ?? 0,
      financial_reports: reports.count ?? 0,
      grants: grants.count ?? 0,
      subscriptions: subscriptions.count ?? 0,
      watchlist_entries: watchlist.count ?? 0,
    },
    plans: planBreakdown,
    recent_ingestions: ingestionRuns.data ?? [],
    timestamp: new Date().toISOString(),
  });
}
