import { createClient } from "@supabase/supabase-js";

// Browser/server client using the anon key. RLS enforces access.
// Service-role operations live in the Python pipeline, never in the browser.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase =
  url && anonKey ? createClient(url, anonKey) : null;
