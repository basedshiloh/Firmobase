import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

export default function Home() {
  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
        <span className="text-lg font-semibold tracking-tight">Firmobase</span>
        <nav className="flex items-center gap-4 text-sm">
          <SignedOut>
            <Link href="/sign-in" className="opacity-80 hover:opacity-100">
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-md bg-[var(--primary)] px-3 py-1.5 font-medium text-white"
            >
              Get started
            </Link>
          </SignedOut>
          <SignedIn>
            <Link href="/dashboard" className="opacity-80 hover:opacity-100">
              Dashboard
            </Link>
            <UserButton />
          </SignedIn>
        </nav>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="text-balance text-5xl font-bold tracking-tight">
          Polish company intelligence, in one place.
        </h1>
        <p className="mt-6 text-lg text-balance opacity-70">
          Registry data, financial statements, grants and relationship graphs
          for millions of companies — fast, modern, and built on public data.
        </p>
        <form action="/search" className="mx-auto mt-10 flex max-w-xl gap-2">
          <input
            name="q"
            placeholder="Search by name, KRS, NIP, REGON, person…"
            className="flex-1 rounded-md border border-[var(--border)] bg-[var(--muted)] px-4 py-3 outline-none focus:border-[var(--primary)]"
          />
          <button
            type="submit"
            className="rounded-md bg-[var(--primary)] px-5 py-3 font-medium text-white"
          >
            Search
          </button>
        </form>
        <p className="mt-4 text-xs opacity-50">
          Phase 0 skeleton — search wires up in Phase 1 (eKRS ingestion).
        </p>
      </section>
    </main>
  );
}
