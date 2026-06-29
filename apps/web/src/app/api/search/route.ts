import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

const PAGE_SIZE = 25;

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json(
      { companies: [], total: 0, page: 1, pages: 0 },
      { status: 200 },
    );
  }

  const params = req.nextUrl.searchParams;
  const q = params.get("q")?.trim() ?? "";
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10));
  const status = params.get("status") ?? "";
  const voivodeship = params.get("voivodeship") ?? "";
  const legalForm = params.get("legal_form") ?? "";
  const sortBy = params.get("sort") ?? "name";
  const sortDir = params.get("dir") === "desc" ? false : true;

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = sb
    .from("companies")
    .select(
      `id, krs, nip, regon, name, legal_form, status,
       registration_date, share_capital, share_capital_currency,
       company_addresses!inner(city, voivodeship)`,
      { count: "exact" },
    )
    .range(from, to);

  // Text search: detect if it's a number (KRS/NIP/REGON) or name
  if (q) {
    const isNumber = /^\d+$/.test(q);
    if (isNumber && q.length === 10) {
      query = query.or(`krs.eq.${q},nip.eq.${q},regon.eq.${q}`);
    } else if (isNumber) {
      query = query.or(`nip.eq.${q},regon.eq.${q},krs.eq.${q}`);
    } else {
      query = query.ilike("name", `%${q}%`);
    }
  }

  if (status) query = query.eq("status", status);
  if (legalForm) query = query.ilike("legal_form", `%${legalForm}%`);
  if (voivodeship) {
    query = query.eq("company_addresses.voivodeship", voivodeship);
  }

  // Sort
  const validSorts: Record<string, string> = {
    name: "name",
    capital: "share_capital",
    date: "registration_date",
    krs: "krs",
  };
  const col = validSorts[sortBy] ?? "name";
  query = query.order(col, { ascending: sortDir, nullsFirst: false });

  const { data, count, error } = await query;

  if (error) {
    // If inner join fails (no addresses), retry without address filter
    if (error.message.includes("company_addresses") && !voivodeship) {
      const fallback = sb
        .from("companies")
        .select(
          "id, krs, nip, regon, name, legal_form, status, registration_date, share_capital, share_capital_currency",
          { count: "exact" },
        )
        .range(from, to)
        .order(col, { ascending: sortDir, nullsFirst: false });

      if (q) {
        const isNumber = /^\d+$/.test(q);
        if (isNumber) {
          fallback.or(`krs.eq.${q},nip.eq.${q},regon.eq.${q}`);
        } else {
          fallback.ilike("name", `%${q}%`);
        }
      }
      if (status) fallback.eq("status", status);
      if (legalForm) fallback.ilike("legal_form", `%${legalForm}%`);

      const fb = await fallback;
      return NextResponse.json({
        companies: fb.data ?? [],
        total: fb.count ?? 0,
        page,
        pages: Math.ceil((fb.count ?? 0) / PAGE_SIZE),
      });
    }

    return NextResponse.json(
      { companies: [], total: 0, page: 1, pages: 0, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    companies: data ?? [],
    total: count ?? 0,
    page,
    pages: Math.ceil((count ?? 0) / PAGE_SIZE),
  });
}

// Autocomplete endpoint — lightweight, returns top 8 name matches
export async function POST(req: NextRequest) {
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ suggestions: [] });

  const body = await req.json();
  const q = (body.q ?? "").trim();
  if (q.length < 2) return NextResponse.json({ suggestions: [] });

  const { data } = await sb
    .from("companies")
    .select("id, name, krs, nip")
    .ilike("name", `%${q}%`)
    .limit(8)
    .order("name");

  return NextResponse.json({
    suggestions: (data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      krs: c.krs,
      nip: c.nip,
    })),
  });
}
