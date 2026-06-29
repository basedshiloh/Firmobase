import { currentUser } from "@clerk/nextjs/server";
import { Navbar } from "@/components/navbar";

export default async function DashboardPage() {
  const user = await currentUser();

  return (
    <main className="min-h-screen">
      <Navbar />
      <section className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-2xl font-semibold">
          Welcome{user?.firstName ? `, ${user.firstName}` : ""}.
        </h1>
        <p className="mt-2 opacity-70">
          Watchlists, saved searches and alerts arrive in Phase 8.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {["Companies tracked", "Saved searches", "Active alerts"].map((t) => (
            <div
              key={t}
              className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-5"
            >
              <div className="text-sm opacity-60">{t}</div>
              <div className="mt-2 text-3xl font-semibold">0</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
