import { getSupabase } from "@/lib/supabase";

type GrantRow = {
  id: string;
  match_method: string;
  match_score: number | null;
  grants: {
    id: string;
    program: string;
    program_year: number | null;
    title: string;
    description: string | null;
    amount_pln: number | null;
    amount_eu: number | null;
    start_date: string | null;
    end_date: string | null;
    status: string | null;
    voivodeship: string | null;
    source_url: string | null;
  };
};

async function fetchGrants(companyId: string): Promise<GrantRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("company_grants")
    .select(
      "id, match_method, match_score, grants(id, program, program_year, title, description, amount_pln, amount_eu, start_date, end_date, status, voivodeship, source_url)",
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as GrantRow[];
}

function fmtPln(value: number | null): string {
  if (value == null) return "—";
  return `${Number(value).toLocaleString("pl-PL", { maximumFractionDigits: 0 })} PLN`;
}

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-500/10 text-green-400",
  in_progress: "bg-blue-500/10 text-blue-400",
  cancelled: "bg-red-500/10 text-red-400",
};

export async function CompanyGrants({ companyId }: { companyId: string }) {
  const rows = await fetchGrants(companyId);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--border)] p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider opacity-50">
          Government grants
        </h2>
        <p className="text-sm opacity-50">
          No grants linked to this company yet. Grant data is sourced from
          PARP, NCBR, FENG, and other EU co-financed programs.
        </p>
      </div>
    );
  }

  const totalPln = rows.reduce(
    (sum, r) => sum + (Number(r.grants.amount_pln) || 0),
    0,
  );
  const totalEu = rows.reduce(
    (sum, r) => sum + (Number(r.grants.amount_eu) || 0),
    0,
  );

  return (
    <div className="rounded-lg border border-[var(--border)] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider opacity-50">
          Government grants
        </h2>
        <span className="text-xs opacity-40">
          {rows.length} grant{rows.length !== 1 ? "s" : ""} linked
        </span>
      </div>

      {/* Summary cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-md bg-[var(--muted)] p-3">
          <div className="text-xs opacity-50">Total grant value</div>
          <div className="mt-1 text-lg font-semibold">{fmtPln(totalPln)}</div>
        </div>
        <div className="rounded-md bg-[var(--muted)] p-3">
          <div className="text-xs opacity-50">EU co-financing</div>
          <div className="mt-1 text-lg font-semibold">{fmtPln(totalEu)}</div>
        </div>
        <div className="rounded-md bg-[var(--muted)] p-3">
          <div className="text-xs opacity-50">Programs</div>
          <div className="mt-1 text-lg font-semibold">
            {[...new Set(rows.map((r) => r.grants.program))].length}
          </div>
        </div>
      </div>

      {/* Grant list */}
      <div className="space-y-3">
        {rows.map((r) => {
          const g = r.grants;
          const statusClass =
            STATUS_COLORS[g.status ?? ""] ?? "bg-[var(--muted)] opacity-60";
          return (
            <div
              key={r.id}
              className="rounded-md border border-[var(--border)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded bg-[var(--primary)]/10 px-1.5 py-0.5 text-xs font-semibold text-[var(--primary)]">
                      {g.program}
                      {g.program_year ? ` ${g.program_year}` : ""}
                    </span>
                    {g.status && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClass}`}
                      >
                        {g.status.replace("_", " ")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm font-medium leading-snug">
                    {g.title}
                  </p>
                  {g.description && (
                    <p className="mt-1 text-xs leading-relaxed opacity-50">
                      {g.description.length > 200
                        ? g.description.slice(0, 200) + "…"
                        : g.description}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold">
                    {fmtPln(g.amount_pln)}
                  </div>
                  {g.amount_eu != null && (
                    <div className="text-[10px] opacity-40">
                      EU: {fmtPln(g.amount_eu)}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] opacity-40">
                {g.start_date && (
                  <span>
                    {g.start_date}
                    {g.end_date ? ` → ${g.end_date}` : ""}
                  </span>
                )}
                {g.voivodeship && <span>{g.voivodeship}</span>}
                {g.source_url && (
                  <a
                    href={g.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--primary)] hover:underline"
                  >
                    Source →
                  </a>
                )}
                <span className="ml-auto">
                  matched by {r.match_method}
                  {r.match_score != null
                    ? ` (${(r.match_score * 100).toFixed(0)}%)`
                    : ""}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
