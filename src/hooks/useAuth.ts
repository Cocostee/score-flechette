"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";

export interface SignUpResult {
  error: string | null;
  needsConfirm: boolean;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
  configured: boolean;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

/* Tracks the Supabase auth session and exposes sign-in/up/out actions. */
export function useAuth(): AuthState {
  const supabase = getSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setUser(data.session?.user ?? null);
        setLoading(false);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const signUp = useCallback(
    async (email: string, password: string): Promise<SignUpResult> => {
      if (!supabase) {
        return { error: "Service indisponible", needsConfirm: false };
      }
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        return { error: error.message, needsConfirm: false };
      }
      return { error: null, needsConfirm: data.session === null };
    },
    [supabase],
  );

  const signIn = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      if (!supabase) {
        return "Service indisponible";
      }
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return error ? error.message : null;
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
  }, [supabase]);

  return {
    user,
    loading,
    configured: supabase !== null,
    signUp,
    signIn,
    signOut,
  };
}
