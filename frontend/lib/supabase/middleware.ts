import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * updateSession
 * Refreshes the Supabase session cookie on every request and returns:
 *  - the (potentially refreshed) response to forward
 *  - the authenticated user (or null if unauthenticated)
 *
 * Must be called from middleware.ts only — uses NextRequest/NextResponse
 * directly because the Edge runtime does not support next/headers.
 *
 * Follows the official @supabase/ssr pattern:
 * https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs
 */
export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  user: { id: string; email?: string } | null;
}> {
  // Start with a passthrough response we'll mutate with refreshed cookies
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Mirror cookies onto the request so any further middleware sees them
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Rebuild the response so we can stamp the refreshed cookies onto it
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: use getUser(), NOT getSession().
  // getSession() reads from the local cookie without re-validating the JWT.
  // getUser() hits the Supabase Auth server and guarantees the token is valid.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response: supabaseResponse, user };
}
