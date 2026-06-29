import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "@/lib/supabase";

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  if (!anthropic) {
    return NextResponse.json(
      { error: "AI insights unavailable — API key not configured" },
      { status: 503 },
    );
  }

  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }

  // Gather all company data in parallel
  const [companyRes, rolesRes, reportsRes, grantsRes] = await Promise.all([
    sb.from("companies").select("*").eq("id", companyId).single(),
    sb
      .from("company_roles")
      .select("role_category, position, is_current, person:persons(full_name, person_type)")
      .eq("company_id", companyId)
      .eq("is_current", true),
    sb
      .from("financial_reports")
      .select(
        "fiscal_year, revenue, operating_profit, net_profit, total_assets, total_equity, total_liabilities, cash, consolidated",
      )
      .eq("company_id", companyId)
      .order("fiscal_year", { ascending: false })
      .limit(5),
    sb
      .from("company_grants")
      .select("grants(program, title, amount_pln, amount_eu, status)")
      .eq("company_id", companyId)
      .limit(20),
  ]);

  const company = companyRes.data;
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const roles = rolesRes.data ?? [];
  const reports = reportsRes.data ?? [];
  const grants = grantsRes.data ?? [];

  const dataContext = buildContext(company, roles, reports, grants);

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content: `You are Firmobase AI, an analyst for Polish companies. Based on the data below, provide a concise intelligence report.

DATA:
${dataContext}

Respond with EXACTLY this JSON structure (no markdown, no code fences):
{
  "summary": "2-3 sentence overview of the company — what it does, its scale, and current standing.",
  "risk_flags": ["List of 0-4 specific risk observations based on the data. E.g. declining revenue, high debt ratio, board changes. Only include if evidence exists."],
  "strengths": ["List of 0-4 specific strengths. E.g. strong margins, growth trajectory, EU funding."],
  "financial_narrative": "1-2 sentences explaining the financial trajectory in plain language. Null if no financial data.",
  "outlook": "1 sentence forward-looking assessment based on available data."
}`,
        },
      ],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    }

    if (!parsed) {
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      insights: parsed,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: `AI error: ${msg}` }, { status: 502 });
  }
}

function buildContext(
  company: Record<string, unknown>,
  roles: Record<string, unknown>[],
  reports: Record<string, unknown>[],
  grants: Record<string, unknown>[],
): string {
  const lines: string[] = [];

  lines.push(`COMPANY: ${company.name}`);
  lines.push(`KRS: ${company.krs ?? "N/A"}, NIP: ${company.nip ?? "N/A"}`);
  lines.push(`Legal form: ${company.legal_form ?? "N/A"}`);
  lines.push(`Status: ${company.status ?? "N/A"}`);
  lines.push(`Registration: ${company.registration_date ?? "N/A"}`);
  if (company.share_capital) {
    lines.push(
      `Share capital: ${Number(company.share_capital).toLocaleString("pl-PL")} ${company.share_capital_currency ?? "PLN"}`,
    );
  }

  if (roles.length > 0) {
    lines.push(`\nCURRENT ROLES (${roles.length}):`);
    for (const r of roles.slice(0, 15)) {
      const person = r.person as Record<string, unknown> | null;
      lines.push(
        `- ${person?.full_name ?? "?"} | ${r.role_category} | ${r.position ?? "—"}`,
      );
    }
  }

  if (reports.length > 0) {
    lines.push(`\nFINANCIALS (${reports.length} years, most recent first):`);
    for (const r of reports) {
      lines.push(
        `FY${r.fiscal_year}${r.consolidated ? " (consolidated)" : ""}: ` +
          `Revenue=${fmt(r.revenue)}, OpProfit=${fmt(r.operating_profit)}, ` +
          `NetProfit=${fmt(r.net_profit)}, Assets=${fmt(r.total_assets)}, ` +
          `Equity=${fmt(r.total_equity)}, Liabilities=${fmt(r.total_liabilities)}, ` +
          `Cash=${fmt(r.cash)}`,
      );
    }
  }

  if (grants.length > 0) {
    lines.push(`\nGRANTS (${grants.length}):`);
    for (const g of grants) {
      const grant = g.grants as Record<string, unknown> | null;
      if (grant) {
        lines.push(
          `- ${grant.program}: ${grant.title} | ${fmt(grant.amount_pln)} PLN (EU: ${fmt(grant.amount_eu)}) | ${grant.status ?? "N/A"}`,
        );
      }
    }
  }

  return lines.join("\n");
}

function fmt(v: unknown): string {
  if (v == null) return "N/A";
  return Number(v).toLocaleString("pl-PL");
}
