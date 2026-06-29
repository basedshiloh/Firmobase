import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }

  // 1. Get the source company
  const { data: company } = await sb
    .from("companies")
    .select("id, name, krs, legal_form, status")
    .eq("id", companyId)
    .single();

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  // 2. Get all roles for this company (with person info)
  const { data: roles } = await sb
    .from("company_roles")
    .select("id, role_category, position, is_current, person_id, company_id")
    .eq("company_id", companyId);

  const companyRoles = roles ?? [];
  const personIds = [...new Set(companyRoles.map((r) => r.person_id))];

  if (personIds.length === 0) {
    return NextResponse.json({
      nodes: [{ id: company.id, type: "company", label: company.name, data: company }],
      edges: [],
    });
  }

  // 3. Get person details
  const { data: persons } = await sb
    .from("persons")
    .select("id, full_name, person_type")
    .in("id", personIds);

  // 4. Get all OTHER roles these persons hold (to find connected companies)
  const { data: otherRoles } = await sb
    .from("company_roles")
    .select("id, role_category, position, is_current, person_id, company_id")
    .in("person_id", personIds)
    .neq("company_id", companyId);

  const allOtherRoles = otherRoles ?? [];
  const otherCompanyIds = [...new Set(allOtherRoles.map((r) => r.company_id))];

  // 5. Get connected companies
  let connectedCompanies: typeof company[] = [];
  if (otherCompanyIds.length > 0) {
    const { data } = await sb
      .from("companies")
      .select("id, name, krs, legal_form, status")
      .in("id", otherCompanyIds);
    connectedCompanies = data ?? [];
  }

  // Build graph
  type Node = {
    id: string;
    type: "company" | "person";
    label: string;
    isSource?: boolean;
    data: Record<string, unknown>;
  };

  type Edge = {
    id: string;
    source: string;
    target: string;
    label: string;
    isCurrent: boolean;
  };

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const nodeSet = new Set<string>();

  const addNode = (n: Node) => {
    if (!nodeSet.has(n.id)) {
      nodeSet.add(n.id);
      nodes.push(n);
    }
  };

  // Source company
  addNode({ id: company.id, type: "company", label: company.name, isSource: true, data: company });

  // Persons
  for (const p of persons ?? []) {
    addNode({ id: p.id, type: "person", label: p.full_name, data: p });
  }

  // Connected companies
  for (const c of connectedCompanies) {
    addNode({ id: c.id, type: "company", label: c.name, data: c });
  }

  const roleLabel = (r: { role_category: string; position: string | null }) => {
    const cat: Record<string, string> = {
      management_board: "Board",
      supervisory_board: "Supervisory",
      proxy: "Proxy",
      shareholder: "Shareholder",
    };
    return r.position || cat[r.role_category] || r.role_category;
  };

  // Edges from source company roles
  for (const r of companyRoles) {
    edges.push({
      id: r.id,
      source: r.person_id,
      target: r.company_id,
      label: roleLabel(r),
      isCurrent: r.is_current,
    });
  }

  // Edges from other company roles
  for (const r of allOtherRoles) {
    edges.push({
      id: r.id,
      source: r.person_id,
      target: r.company_id,
      label: roleLabel(r),
      isCurrent: r.is_current,
    });
  }

  return NextResponse.json({ nodes, edges });
}
