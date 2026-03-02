import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/leaderboard"];
const IS_DEV = process.env.NEXT_PUBLIC_IS_DEV === "true";

export function middleware(request: NextRequest) {
  // In dev mode, skip all protection
  if (IS_DEV) return NextResponse.next();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (isPublic) return NextResponse.next();

  // Check session cookie set by AuthContext
  const session = request.cookies.get("pixtopia_auth");
  if (!session?.value) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals, API routes, and ALL static files (svg, png, jpg, woff, etc.)
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.webp$|.*\\.ico$|.*\\.woff$|.*\\.woff2$).*)",
  ],
};
