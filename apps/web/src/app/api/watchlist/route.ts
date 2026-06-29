import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ items: [] });

  const { data } = await sb
    .from("watchlist")
    .select("company_id, created_at, companies(id, name, krs, status)")
    .eq("clerk_user_id", userId)
    .order("created_at", { ascending: false });

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }

  const { companyId } = await req.json();
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const { error } = await sb.from("watchlist").upsert(
    { clerk_user_id: userId, company_id: companyId },
    { onConflict: "clerk_user_id,company_id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ added: true });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }

  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  await sb
    .from("watchlist")
    .delete()
    .eq("clerk_user_id", userId)
    .eq("company_id", companyId);

  return NextResponse.json({ removed: true });
}
