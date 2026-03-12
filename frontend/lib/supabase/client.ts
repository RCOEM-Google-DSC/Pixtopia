import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client — module-level singleton.
 * Only one instance is ever created per page load so that the
 * Web Locks API used internally for token-refresh coordination
 * is never contested, avoiding the "AbortError: lock request aborted" crash.
 */
let _client: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return _client;
}
