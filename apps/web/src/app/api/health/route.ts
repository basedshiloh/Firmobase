import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  const checks: Record<string, "ok" | "error"> = {
    app: "ok",
    supabase: "error",
    ai: process.env.OPENROUTER_API_KEY ? "ok" : "error",
    stripe: process.env.STRIPE_SECRET_KEY ? "ok" : "error",
  };

  const sb = getSupabase();
  if (sb) {
    try {
      const { error } = await sb
        .from("companies")
        .select("id", { count: "exact", head: true });
      checks.supabase = error ? "error" : "ok";
    } catch {
      checks.supabase = "error";
    }
  }

  const allOk = Object.values(checks).every((v) => v === "ok");

  return NextResponse.json(
    { status: allOk ? "healthy" : "degraded", checks },
    { status: allOk ? 200 : 503 },
  );
}
