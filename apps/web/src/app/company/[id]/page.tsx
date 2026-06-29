import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { CompanyFinancials } from "@/components/company-financials";
import { RelationshipGraph } from "@/components/relationship-graph";
import { getSupabase } from "@/lib/supabase";

type Params = Promise<{ id: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id } = await params;
  const company = await fetchCompany(id);
  if (!company) return { title: "Company not found — Firmobase" };
  return {
    title: `${company.name} — Firmobase`,
    description: `${company.name} (KRS ${company.krs ?? "—"}, NIP ${company.nip ?? "—"}) — registry data, board members, financials and more.`,
  };
}

type Company = {
  id: string;
  krs: string | null;
  nip: string | null;
  regon: string | null;
  name: string;
  legal_form: string | null;
  status: string | null;
  ekrs_section: string | null;
  registry_court: string | null;
  registration_date: string | null;
  share_capital: number | null;
  share_capital_currency: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
};

type Address = {
  id: string;
  address_type: string | null;
  street: string | null;
  building_no: string | null;
  apartment_no: string | null;
  postal_code: string | null;
  city: string | null;
  voivodeship: string | null;
  valid_from: string | null;
  valid_to: string | null;
};

type Role = {
  id: string;
  role_category: string;
  position: string | null;
  is_current: boolean;
  appointed_at: string | null;
  ended_at: string | null;
  shareholding_pct: number | null;
  shares_value: number | null;
  person: {
    id: string;
    full_name: string;
    person_type: string;
  };
};

type Pkd = {
  is_primary: boolean;
  pkd_code: string;
  pkd_codes: { code: string; description: string | null; section: string | null };
};

async function fetchCompany(id: string) {
  const sb = getSupabase();
  if (!sb) return null;

  const { data } = await sb
    .from("companies")
    .select("*")
    .eq("id", id)
    .single();
  return data as Company | null;
}

async function fetchAddresses(companyId: string) {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("company_addresses")
    .select("*")
    .eq("company_id", companyId)
    .order("valid_from", { ascending: false, nullsFirst: false });
  return (data ?? []) as Address[];
}

async function fetchRoles(companyId: string) {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("company_roles")
    .select("*, person:persons(id, full_name, person_type)")
    .eq("company_id", companyId)
    .order("is_current", { ascending: false })
    .order("role_category")
    .order("appointed_at", { ascending: false, nullsFirst: false });
  return (data ?? []) as Role[];
}

async function fetchPkd(companyId: string) {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("company_pkd")
    .select("is_primary, pkd_code, pkd_codes(code, description, section)")
    .eq("company_id", companyId)
    .order("is_primary", { ascending: false });
  // Supabase infers the joined relation as an array; it's a to-one at runtime.
  return (data ?? []) as unknown as Pkd[];
}

export default async function CompanyPage({ params }: { params: Params }) {
  const { id } = await params;
  const [company, addresses, roles, pkdList] = await Promise.all([
    fetchCompany(id),
    fetchAddresses(id),
    fetchRoles(id),
    fetchPkd(id),
  ]);

  if (!company) notFound();

  const currentBoard = roles.filter(
    (r) => r.is_current && r.role_category === "management_board"
  );
  const currentSupervisory = roles.filter(
    (r) => r.is_current && r.role_category === "supervisory_board"
  );
  const currentProxies = roles.filter(
    (r) => r.is_current && r.role_category === "proxy"
  );
  const shareholders = roles.filter(
    (r) => r.is_current && r.role_category === "shareholder"
  );
  const historicalRoles = roles.filter((r) => !r.is_current);
  const currentAddress = addresses.find((a) => !a.valid_to);

  return (
    <main className="min-h-screen">
      <Navbar />

      <section className="mx-auto max-w-5xl px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{company.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm opacity-60">
              {company.legal_form && <span>{company.legal_form}</span>}
              {company.status && <StatusBadge status={company.status} />}
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {/* Left column — info cards */}
          <div className="space-y-6 lg:col-span-2">
            {/* General info */}
            <Card title="Registry information">
              <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                <Field label="KRS" value={company.krs} mono />
                <Field label="NIP" value={company.nip} mono />
                <Field label="REGON" value={company.regon} mono />
                <Field label="Registry section" value={company.ekrs_section} />
                <Field label="Registry court" value={company.registry_court} />
                <Field label="Registration date" value={company.registration_date} />
                <Field
                  label="Share capital"
                  value={
                    company.share_capital
                      ? `${Number(company.share_capital).toLocaleString("pl-PL")} ${company.share_capital_currency ?? "PLN"}`
                      : null
                  }
                />
              </dl>
            </Card>

            {/* Financials */}
            <Suspense
              fallback={
                <div className="h-48 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--muted)]" />
              }
            >
              <CompanyFinancials companyId={id} />
            </Suspense>

            {/* Relationship graph */}
            <RelationshipGraph companyId={id} />

            {/* Management board */}
            {currentBoard.length > 0 && (
              <Card title="Management board">
                <RolesTable roles={currentBoard} showShares={false} />
              </Card>
            )}

            {/* Supervisory board */}
            {currentSupervisory.length > 0 && (
              <Card title="Supervisory board">
                <RolesTable roles={currentSupervisory} showShares={false} />
              </Card>
            )}

            {/* Proxies */}
            {currentProxies.length > 0 && (
              <Card title="Proxies">
                <RolesTable roles={currentProxies} showShares={false} />
              </Card>
            )}

            {/* Shareholders */}
            {shareholders.length > 0 && (
              <Card title="Shareholders">
                <RolesTable roles={shareholders} showShares />
              </Card>
            )}

            {/* Historical roles */}
            {historicalRoles.length > 0 && (
              <Card title="Historical roles">
                <RolesTable roles={historicalRoles} showShares={false} />
              </Card>
            )}

            {/* PKD codes */}
            {pkdList.length > 0 && (
              <Card title="Activity codes (PKD)">
                <div className="space-y-2 text-sm">
                  {pkdList.map((p) => (
                    <div key={p.pkd_code} className="flex items-start gap-2">
                      <span className="shrink-0 rounded bg-[var(--muted)] px-1.5 py-0.5 font-mono text-xs">
                        {p.pkd_code}
                      </span>
                      <span className="opacity-80">
                        {p.pkd_codes?.description ?? "—"}
                      </span>
                      {p.is_primary && (
                        <span className="shrink-0 rounded-full bg-[var(--primary)]/10 px-2 py-0.5 text-xs font-medium text-[var(--primary)]">
                          Primary
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Right column — sidebar */}
          <div className="space-y-6">
            {/* Contact */}
            <Card title="Contact">
              <dl className="space-y-2 text-sm">
                {currentAddress && (
                  <div>
                    <dt className="text-xs uppercase tracking-wider opacity-40">
                      Address
                    </dt>
                    <dd className="mt-0.5">
                      {[currentAddress.street, currentAddress.building_no]
                        .filter(Boolean)
                        .join(" ")}
                      {currentAddress.apartment_no &&
                        ` / ${currentAddress.apartment_no}`}
                      <br />
                      {currentAddress.postal_code} {currentAddress.city}
                      {currentAddress.voivodeship &&
                        `, woj. ${currentAddress.voivodeship}`}
                    </dd>
                  </div>
                )}
                {company.website && (
                  <div>
                    <dt className="text-xs uppercase tracking-wider opacity-40">
                      Website
                    </dt>
                    <dd className="mt-0.5 truncate">
                      <a
                        href={
                          company.website.startsWith("http")
                            ? company.website
                            : `https://${company.website}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--primary)] hover:underline"
                      >
                        {company.website}
                      </a>
                    </dd>
                  </div>
                )}
                {company.email && (
                  <div>
                    <dt className="text-xs uppercase tracking-wider opacity-40">
                      Email
                    </dt>
                    <dd className="mt-0.5">{company.email}</dd>
                  </div>
                )}
                {company.phone && (
                  <div>
                    <dt className="text-xs uppercase tracking-wider opacity-40">
                      Phone
                    </dt>
                    <dd className="mt-0.5">{company.phone}</dd>
                  </div>
                )}
                {!currentAddress &&
                  !company.website &&
                  !company.email &&
                  !company.phone && (
                    <p className="opacity-40">No contact info available.</p>
                  )}
              </dl>
            </Card>

            {/* Address history */}
            {addresses.length > 1 && (
              <Card title="Address history">
                <div className="space-y-3 text-sm">
                  {addresses.map((a) => (
                    <div
                      key={a.id}
                      className={`${a.valid_to ? "opacity-50" : ""}`}
                    >
                      <p>
                        {[a.street, a.building_no].filter(Boolean).join(" ")}
                        {a.apartment_no && ` / ${a.apartment_no}`}
                      </p>
                      <p className="text-xs opacity-60">
                        {a.postal_code} {a.city}
                        {a.valid_from && ` · from ${a.valid_from}`}
                        {a.valid_to && ` to ${a.valid_to}`}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider opacity-50">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider opacity-40">{label}</dt>
      <dd className={`mt-0.5 ${mono ? "font-mono text-xs" : ""}`}>
        {value ?? <span className="opacity-30">—</span>}
      </dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status.toLowerCase().includes("aktywn");
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        isActive
          ? "bg-green-500/10 text-green-400"
          : "bg-yellow-500/10 text-yellow-400"
      }`}
    >
      {status}
    </span>
  );
}

function RolesTable({
  roles,
  showShares,
}: {
  roles: Role[];
  showShares: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider opacity-40">
            <th className="pb-2 font-medium">Name</th>
            <th className="pb-2 font-medium">Position</th>
            {showShares && <th className="pb-2 font-medium">Shares</th>}
            <th className="pb-2 font-medium">From</th>
            {roles.some((r) => r.ended_at) && (
              <th className="pb-2 font-medium">To</th>
            )}
          </tr>
        </thead>
        <tbody>
          {roles.map((r) => (
            <tr
              key={r.id}
              className="border-b border-[var(--border)] last:border-0"
            >
              <td className="py-2 pr-4 font-medium">
                {r.person?.full_name ?? "—"}
              </td>
              <td className="py-2 pr-4 opacity-70">{r.position ?? "—"}</td>
              {showShares && (
                <td className="py-2 pr-4 font-mono text-xs opacity-70">
                  {r.shareholding_pct
                    ? `${r.shareholding_pct}%`
                    : r.shares_value
                      ? `${Number(r.shares_value).toLocaleString("pl-PL")} PLN`
                      : "—"}
                </td>
              )}
              <td className="py-2 pr-4 font-mono text-xs opacity-50">
                {r.appointed_at ?? "—"}
              </td>
              {roles.some((r2) => r2.ended_at) && (
                <td className="py-2 font-mono text-xs opacity-50">
                  {r.ended_at ?? "—"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
