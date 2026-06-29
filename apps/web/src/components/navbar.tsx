import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Firmobase
          </Link>
          <nav className="hidden items-center gap-4 text-sm sm:flex">
            <Link href="/search" className="opacity-60 hover:opacity-100">
              Search
            </Link>
            <SignedIn>
              <Link href="/dashboard" className="opacity-60 hover:opacity-100">
                Dashboard
              </Link>
            </SignedIn>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <SignedOut>
            <Link href="/sign-in" className="opacity-70 hover:opacity-100">
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
            <UserButton />
          </SignedIn>
        </div>
      </div>
    </header>
  );
}
