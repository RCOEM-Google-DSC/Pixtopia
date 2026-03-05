import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = ["/login", "/leaderboard"];
const IS_DEV = process.env.NEXT_PUBLIC_IS_DEV === "true";

export async function proxy(request: NextRequest) {
  // In dev mode skip all protection — return immediately, no session overhead
  if (IS_DEV) return NextResponse.next();

  const { pathname } = request.nextUrl;

  // Refresh the Supabase session cookie and get the current user
  const { response, user } = await updateSession(request);

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  // Always let public routes through (with the refreshed response)
  if (isPublic) return response;

  // Protected route — redirect to login if no valid session
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // Skip Next.js internals, API routes, and all static files
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.webp$|.*\\.ico$|.*\\.woff$|.*\\.woff2$).*)",
  ],
};
