import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/auth/login
 * Body: { email: string; password: string }
 * Signs the user in with Supabase Auth and sets the session cookie via @supabase/ssr.
 *
 * Admin bypass: if the email & password match NEXT_PUBLIC_ADMIN_EMAIL /
 * NEXT_PUBLIC_ADMIN_PASS the route will auto-create the Supabase Auth account
 * (first time only) and then sign in normally.
 */
export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }

  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  const adminPass = process.env.NEXT_PUBLIC_ADMIN_PASS;

  // ── Admin bootstrap: ensure the admin Auth user exists ───────────────────
  if (adminEmail && adminPass && email === adminEmail && password === adminPass) {
    try {
      const admin = await createAdminClient();

      // Try to create the admin user (will fail silently if already exists)
      await admin.auth.admin.createUser({
        email: adminEmail,
        password: adminPass,
        email_confirm: true,
      });
    } catch {
      // User already exists — that's fine, we'll just sign in below.
    }
  }

  // ── Normal Supabase sign-in ─────────────────────────────────────────────
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return NextResponse.json({
    user: { id: data.user.id, email: data.user.email },
  });
}
