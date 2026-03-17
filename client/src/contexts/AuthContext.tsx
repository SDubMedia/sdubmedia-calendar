// ============================================================
// AuthContext — Supabase Auth + User Profile with role-based access
// ============================================================

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { UserProfile, UserRole } from "@/lib/types";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  // User management (owner only)
  createUser: (email: string, password: string, name: string, role: UserRole, clientIds: string[]) => Promise<void>;
  updateUserProfile: (id: string, updates: Partial<Pick<UserProfile, "name" | "role" | "clientIds">>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  allProfiles: UserProfile[];
  refreshProfiles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function rowToProfile(r: any): UserProfile {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role as UserRole,
    clientIds: r.client_ids || [],
    createdAt: r.created_at,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [allProfiles, setAllProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (error || !data) return null;
    return rowToProfile(data);
  }, []);

  const refreshProfiles = useCallback(async () => {
    const { data } = await supabase.from("user_profiles").select("*").order("created_at");
    if (data) setAllProfiles(data.map(rowToProfile));
  }, []);

  // Listen for auth state changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id).then(p => {
          setProfile(p);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id).then(p => setProfile(p));
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setAllProfiles([]);
  }, []);

  const createUser = useCallback(async (email: string, password: string, name: string, role: UserRole, clientIds: string[]) => {
    // Sign up the user via Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (authError) throw new Error(authError.message);
    if (!authData.user) throw new Error("Failed to create user");

    // Create profile
    const { error: profileError } = await supabase.from("user_profiles").insert({
      id: authData.user.id,
      email,
      name,
      role,
      client_ids: clientIds,
    });
    if (profileError) throw new Error(profileError.message);

    await refreshProfiles();
  }, [refreshProfiles]);

  const updateUserProfile = useCallback(async (id: string, updates: Partial<Pick<UserProfile, "name" | "role" | "clientIds">>) => {
    const patch: any = {};
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.role !== undefined) patch.role = updates.role;
    if (updates.clientIds !== undefined) patch.client_ids = updates.clientIds;
    const { error } = await supabase.from("user_profiles").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    await refreshProfiles();
  }, [refreshProfiles]);

  const deleteUser = useCallback(async (id: string) => {
    // Delete profile (auth user deletion requires admin API)
    const { error } = await supabase.from("user_profiles").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await refreshProfiles();
  }, [refreshProfiles]);

  return (
    <AuthContext.Provider value={{
      user, profile, session, loading,
      signIn, signOut,
      createUser, updateUserProfile, deleteUser,
      allProfiles, refreshProfiles,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
