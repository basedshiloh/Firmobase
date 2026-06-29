import { Navbar } from "@/components/navbar";
import { SearchAutocomplete } from "@/components/search-autocomplete";

export default function Home() {
  return (
    <main className="min-h-screen">
      <Navbar />

      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="text-balance text-5xl font-bold tracking-tight">
          Polish company intelligence, in one place.
        </h1>
        <p className="mt-6 text-lg text-balance opacity-70">
          Registry data, financial statements, grants and relationship graphs
          for millions of companies — fast, modern, and built on public data.
        </p>
        <SearchAutocomplete className="mx-auto mt-10 max-w-xl" />
        <p className="mt-4 text-xs opacity-50">
          Aggregating public registry, financial and grant data.
        </p>
      </section>
    </main>
  );
}
