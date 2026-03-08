import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client (Server Components, Route Handlers, Server Actions).
 * Reads/writes session cookies via Next.js cookie store.
 * Uses the anon key by default — pass the service role key for admin operations.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from a Server Component — cookies can only be
            // set in middleware or Route Handlers. Safe to ignore here.
          }
        },
      },
    }
  );
}

/**
 * Server-side Supabase client with the service role key.
 * Bypasses RLS — use ONLY in trusted server contexts (API routes, seed scripts).
 * NEVER expose this on the client.
 */
export async function createAdminClient() {
  // Use the raw @supabase/supabase-js client with the service role key.
  // This bypasses RLS and does NOT read/write session cookies — which is
  // exactly what we want for admin operations.
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}
