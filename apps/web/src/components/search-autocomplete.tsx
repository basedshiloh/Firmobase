"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Suggestion = { id: string; name: string; krs: string | null; nip: string | null };

export function SearchAutocomplete({
  defaultValue,
  className,
}: {
  defaultValue?: string;
  className?: string;
}) {
  const [query, setQuery] = useState(defaultValue ?? "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q }),
      });
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
      setOpen(true);
    } catch {
      setSuggestions([]);
    }
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    setActive(-1);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchSuggestions(val), 200);
  };

  const navigate = (id: string) => {
    setOpen(false);
    router.push(`/company/${id}`);
  };

  const submit = () => {
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0) navigate(suggestions[active].id);
      else submit();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  useEffect(() => {
    const onClickOutside = () => setOpen(false);
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, []);

  return (
    <div className={`relative ${className ?? ""}`} onClick={(e) => e.stopPropagation()}>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Search by name, KRS, NIP, REGON…"
          className="flex-1 rounded-md border border-[var(--border)] bg-[var(--muted)] px-4 py-2.5 outline-none focus:border-[var(--primary)]"
        />
        <button
          type="button"
          onClick={submit}
          className="rounded-md bg-[var(--primary)] px-5 py-2.5 font-medium text-white"
        >
          Search
        </button>
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 z-50 mt-1 max-h-80 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-lg">
          {suggestions.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => navigate(s.id)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-[var(--muted)] ${
                  i === active ? "bg-[var(--muted)]" : ""
                }`}
              >
                <span className="font-medium">{s.name}</span>
                {s.krs && (
                  <span className="shrink-0 font-mono text-xs opacity-40">
                    KRS {s.krs}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
