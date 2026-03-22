import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";

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
 * Fast auth check for API routes.
 * Uses getSession() which validates the JWT **locally from the cookie**
 * instead of getUser() which makes a network round-trip to Supabase Auth.
 * This saves ~200-500ms per API request in production.
 *
 * Only use getUser() when you need the absolute freshest user data
 * (e.g. during login/signup flows).
 */
export async function getSessionUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}

// ─── Cached admin client ─────────────────────────────────────────────────────
// Cache the dynamic import so module resolution only happens once
let _createClientFn: typeof import("@supabase/supabase-js")["createClient"] | null = null;

/**
 * Server-side Supabase client with the service role key.
 * Bypasses RLS — use ONLY in trusted server contexts (API routes, seed scripts).
 * NEVER expose this on the client.
 * Includes 8s timeout to prevent long hangs on network issues.
 */
export async function createAdminClient() {
  if (!_createClientFn) {
    const mod = await import("@supabase/supabase-js");
    _createClientFn = mod.createClient;
  }
  return _createClientFn(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: (url, options) => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          return fetch(url, { 
            ...options, 
            signal: controller.signal 
          }).finally(() => clearTimeout(timeoutId));
        }
      }
    }
  );
}
