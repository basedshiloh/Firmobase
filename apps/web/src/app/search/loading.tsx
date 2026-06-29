export default function SearchLoading() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-8">
      <div className="h-11 w-full animate-pulse rounded-md bg-[var(--muted)]" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--muted)]"
          />
        ))}
      </div>
    </section>
  );
}
