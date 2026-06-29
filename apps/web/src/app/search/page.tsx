import Link from "next/link";
import { SearchAutocomplete } from "@/components/search-autocomplete";
import { Navbar } from "@/components/navbar";
import { getSupabase } from "@/lib/supabase";

const PAGE_SIZE = 25;

const VOIVODESHIPS = [
  "DOLNOŚLĄSKIE", "KUJAWSKO-POMORSKIE", "LUBELSKIE", "LUBUSKIE",
  "ŁÓDZKIE", "MAŁOPOLSKIE", "MAZOWIECKIE", "OPOLSKIE",
  "PODKARPACKIE", "PODLASKIE", "POMORSKIE", "ŚLĄSKIE",
  "ŚWIĘTOKRZYSKIE", "WARMIŃSKO-MAZURSKIE", "WIELKOPOLSKIE",
  "ZACHODNIOPOMORSKIE",
];

type SearchParams = Promise<{
  q?: string;
  status?: string;
  voivodeship?: string;
  legal_form?: string;
  pkd?: string;
  sort?: string;
  dir?: string;
  page?: string;
}>;

type Company = {
  id: string;
  krs: string | null;
  nip: string | null;
  regon: string | null;
  name: string;
  legal_form: string | null;
  status: string | null;
  registration_date: string | null;
  share_capital: number | null;
  share_capital_currency: string | null;
};

async function searchCompanies(params: Awaited<SearchParams>) {
  const sb = getSupabase();
  if (!sb) return { data: [] as Company[], count: 0 };

  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const sortMap: Record<string, string> = {
    name: "name",
    capital: "share_capital",
    date: "registration_date",
    krs: "krs",
  };
  const sortCol = sortMap[params.sort ?? "name"] ?? "name";
  const ascending = params.dir !== "desc";

  let query = sb
    .from("companies")
    .select(
      "id, krs, nip, regon, name, legal_form, status, registration_date, share_capital, share_capital_currency",
      { count: "exact" },
    )
    .range(from, to)
    .order(sortCol, { ascending, nullsFirst: false });

  const q = params.q?.trim();
  if (q) {
    const isNumber = /^\d+$/.test(q);
    if (isNumber) {
      query = query.or(`krs.eq.${q},nip.eq.${q},regon.eq.${q}`);
    } else {
      query = query.ilike("name", `%${q}%`);
    }
  }

  if (params.status) query = query.eq("status", params.status);
  if (params.legal_form)
    query = query.ilike("legal_form", `%${params.legal_form}%`);

  const { data, count } = await query;
  return { data: (data ?? []) as Company[], count: count ?? 0 };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const currentPage = Math.max(1, parseInt(params.page ?? "1", 10));
  const currentSort = params.sort ?? "name";
  const currentDir = params.dir ?? "asc";
  const { data: companies, count } = await searchCompanies(params);
  const totalPages = Math.ceil(count / PAGE_SIZE);

  return (
    <main className="min-h-screen">
      <Navbar />

      <section className="mx-auto max-w-7xl px-6 py-8">
        <SearchAutocomplete defaultValue={q} />

        <div className="mt-6 flex gap-6">
          {/* Filter sidebar */}
          <aside className="hidden w-56 shrink-0 space-y-5 lg:block">
            <FilterGroup title="Status">
              <FilterLink param="status" value="" label="All" current={params.status} q={q} />
              <FilterLink param="status" value="Aktywny" label="Active" current={params.status} q={q} />
              <FilterLink param="status" value="Wykreślony" label="Deleted" current={params.status} q={q} />
            </FilterGroup>

            <FilterGroup title="Legal form">
              <FilterLink param="legal_form" value="" label="All" current={params.legal_form} q={q} />
              <FilterLink param="legal_form" value="SPÓŁKA AKCYJNA" label="S.A." current={params.legal_form} q={q} />
              <FilterLink
                param="legal_form"
                value="SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ"
                label="Sp. z o.o."
                current={params.legal_form}
                q={q}
              />
            </FilterGroup>

            <FilterGroup title="Voivodeship">
              <FilterLink param="voivodeship" value="" label="All" current={params.voivodeship} q={q} />
              {VOIVODESHIPS.map((v) => (
                <FilterLink key={v} param="voivodeship" value={v} label={v.charAt(0) + v.slice(1).toLowerCase()} current={params.voivodeship} q={q} />
              ))}
            </FilterGroup>
          </aside>

          {/* Results */}
          <div className="min-w-0 flex-1">
            {companies.length === 0 && !q && (
              <p className="mt-8 text-center opacity-50">
                Enter a company name, KRS, NIP, or REGON to search.
              </p>
            )}

            {companies.length === 0 && q && (
              <p className="mt-8 text-center opacity-50">
                No companies found for &ldquo;{q}&rdquo;.
              </p>
            )}

            {companies.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm opacity-60">
                    {count.toLocaleString()} result{count !== 1 ? "s" : ""}
                    {q ? ` for "${q}"` : ""}
                  </p>
                  <div className="flex gap-1 text-xs">
                    <SortLink label="Name" field="name" current={currentSort} dir={currentDir} q={q} params={params} />
                    <SortLink label="Capital" field="capital" current={currentSort} dir={currentDir} q={q} params={params} />
                    <SortLink label="KRS" field="krs" current={currentSort} dir={currentDir} q={q} params={params} />
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {companies.map((c) => (
                    <Link
                      key={c.id}
                      href={`/company/${c.id}`}
                      className="flex items-center gap-4 rounded-lg border border-[var(--border)] p-4 transition-colors hover:bg-[var(--muted)]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{c.name}</div>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs opacity-50">
                          {c.krs && <span>KRS {c.krs}</span>}
                          {c.nip && <span>NIP {c.nip}</span>}
                          {c.legal_form && <span>{c.legal_form}</span>}
                          {c.registration_date && <span>Reg. {c.registration_date}</span>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {c.status && <StatusBadge status={c.status} />}
                        {c.share_capital != null && (
                          <div className="mt-1 font-mono text-xs opacity-50">
                            {Number(c.share_capital).toLocaleString("pl-PL")} {c.share_capital_currency ?? "PLN"}
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="mt-6 flex items-center justify-center gap-2">
                    {currentPage > 1 && (
                      <PageLink page={currentPage - 1} params={params} label="← Prev" />
                    )}
                    <span className="px-3 text-sm opacity-60">
                      Page {currentPage} of {totalPages}
                    </span>
                    {currentPage < totalPages && (
                      <PageLink page={currentPage + 1} params={params} label="Next →" />
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider opacity-40">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function FilterLink({
  param,
  value,
  label,
  current,
  q,
}: {
  param: string;
  value: string;
  label: string;
  current: string | undefined;
  q: string;
}) {
  const isActive = (current ?? "") === value;
  const search = new URLSearchParams();
  if (q) search.set("q", q);
  if (value) search.set(param, value);
  const href = `/search?${search.toString()}`;

  return (
    <Link
      href={href}
      className={`block rounded px-2 py-1 text-sm transition-colors ${
        isActive
          ? "bg-[var(--primary)]/10 font-medium text-[var(--primary)]"
          : "opacity-60 hover:opacity-100"
      }`}
    >
      {label}
    </Link>
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

function SortLink({
  label,
  field,
  current,
  dir,
  q,
  params,
}: {
  label: string;
  field: string;
  current: string;
  dir: string;
  q: string;
  params: Awaited<SearchParams>;
}) {
  const isActive = current === field;
  const nextDir = isActive && dir === "asc" ? "desc" : "asc";
  const search = new URLSearchParams();
  if (q) search.set("q", q);
  if (params.status) search.set("status", params.status);
  if (params.legal_form) search.set("legal_form", params.legal_form);
  search.set("sort", field);
  search.set("dir", nextDir);

  return (
    <Link
      href={`/search?${search.toString()}`}
      className={`rounded px-2 py-1 transition-colors ${
        isActive ? "bg-[var(--muted)] font-medium" : "opacity-50 hover:opacity-100"
      }`}
    >
      {label} {isActive && (dir === "asc" ? "↑" : "↓")}
    </Link>
  );
}

function PageLink({
  page,
  params,
  label,
}: {
  page: number;
  params: Awaited<SearchParams>;
  label: string;
}) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  if (params.legal_form) search.set("legal_form", params.legal_form);
  if (params.sort) search.set("sort", params.sort);
  if (params.dir) search.set("dir", params.dir);
  search.set("page", String(page));

  return (
    <Link
      href={`/search?${search.toString()}`}
      className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)]"
    >
      {label}
    </Link>
  );
}
