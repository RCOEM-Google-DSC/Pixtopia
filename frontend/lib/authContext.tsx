"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "./supabase/client";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;

  useEffect(() => {
    const supabase = createClient();

    // Get the initial session from local cookies/storage — NO network call.
    // Using getSession() instead of getUser() is critical: getUser() makes a
    // network request to Supabase Auth, and the Supabase client serializes
    // all auth operations via Web Locks. On the login page, signInWithPassword()
    // would be BLOCKED until getUser() finishes — and on first visit, with the
    // 11 MB 3D model downloading, that call gets starved for bandwidth.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Subscribe to auth state changes (login, logout, token refresh)
    // @supabase/ssr handles session cookies automatically — no manual cookie management needed.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    // onAuthStateChange will fire and clear user state
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
