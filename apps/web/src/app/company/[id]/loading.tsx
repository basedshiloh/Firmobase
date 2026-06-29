export default function CompanyLoading() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-8">
      <div className="h-8 w-80 animate-pulse rounded bg-[var(--muted)]" />
      <div className="mt-2 h-4 w-48 animate-pulse rounded bg-[var(--muted)]" />
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--muted)]"
            />
          ))}
        </div>
        <div className="space-y-6">
          <div className="h-40 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--muted)]" />
        </div>
      </div>
    </section>
  );
}
