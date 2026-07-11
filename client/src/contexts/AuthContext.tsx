// ============================================================
// AuthContext — Supabase Auth + User Profile with role-based access
// ============================================================

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import type { UserProfile, UserRole, PersonalEventTemplate } from "@/lib/types";
import type { User, Session } from "@supabase/supabase-js";
import { rememberAccount } from "@/lib/recent-accounts";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  // User management (owner only)
  createUser: (email: string, password: string, name: string, role: UserRole, clientIds: string[], crewMemberId?: string) => Promise<string>;
  updateUserProfile: (id: string, updates: Partial<Pick<UserProfile, "name" | "role" | "clientIds" | "crewMemberId" | "featureOverrides" | "showInMeetingAssignments">>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  completeStaffOnboarding: (completedAt: string) => void;
  saveMyTemplates: (templates: PersonalEventTemplate[]) => Promise<void>;
  markGuideSeen: (pageId: string) => Promise<void>;
  markBusinessInfoSetupSeen: (opts?: { stripeOptedOut?: boolean }) => Promise<void>;
  markSeenTravelBaseInfo: () => Promise<void>;
  allProfiles: UserProfile[];
  refreshProfiles: () => Promise<void>;
  // View As (owner only) — preview the app as another role
  viewAsRole: UserRole | null;
  setViewAsRole: (role: UserRole | null) => void;
  // Impersonate (owner only) — see exactly what a specific user sees
  impersonateUserId: string | null;
  setImpersonateUserId: (id: string | null) => void;
  /** The effective profile — uses impersonation or viewAs override if set */
  effectiveProfile: UserProfile | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function rowToProfile(r: any): UserProfile {
  return {
    id: r.id,
    orgId: r.org_id || "",
    email: r.email,
    name: r.name,
    role: r.role as UserRole,
    clientIds: r.client_ids || [],
    crewMemberId: r.crew_member_id || "",
    mustChangePassword: r.must_change_password ?? true,
    hasCompletedOnboarding: r.has_completed_onboarding ?? false,
    staffOnboardingCompletedAt: r.staff_onboarding_completed_at || null,
    featureOverrides: r.feature_overrides || undefined,
    showInMeetingAssignments: r.show_in_meeting_assignments ?? true,
    personalEventTemplates: Array.isArray(r.personal_event_templates) ? r.personal_event_templates : [],
    guidance: (r.guidance && typeof r.guidance === "object")
      ? {
          seenGuides: r.guidance.seenGuides || {},
          businessInfoSetupSeen: r.guidance.businessInfoSetupSeen ?? false,
          stripeOptedOut: r.guidance.stripeOptedOut ?? false,
          manualCompletions: r.guidance.manualCompletions || {},
        }
      : { seenGuides: {}, businessInfoSetupSeen: false, stripeOptedOut: false, manualCompletions: {} },
    createdAt: r.created_at,
  };
}

// Decorate the recent-accounts entry with org name + role so the login
// card picker can show "SDub Media · Owner" instead of just the email.
// Fire-and-forget; never blocks login.
async function rememberAccountFromSession(email: string | null | undefined, profile: UserProfile | null) {
  if (!email) return;
  let orgName: string | undefined;
  if (profile?.orgId) {
    try {
      const { data } = await supabase.from("organizations").select("name").eq("id", profile.orgId).single();
      orgName = data?.name;
    } catch {
      // Non-fatal — card just won't show org name.
    }
  }
  // For a client login, resolve whether they're a broker or an agent so the
  // account switcher can label them correctly (both have the auth role "client").
  let accountType: string | undefined = profile?.role ? profile.role[0].toUpperCase() + profile.role.slice(1) : undefined;
  if (profile?.role === "client" && profile.clientIds?.[0]) {
    try {
      const { data: c } = await supabase.from("clients").select("client_type").eq("id", profile.clientIds[0]).single();
      const t = c?.client_type;
      accountType = t === "broker" ? "Broker" : t === "agent" ? "Agent" : "Client";
    } catch {
      // Non-fatal — fall back to the role label.
    }
  }
  rememberAccount(email, {
    displayName: profile?.name,
    orgName,
    role: profile?.role,
    accountType,
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [allProfiles, setAllProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewAsRole, setViewAsRole] = useState<UserRole | null>(() => {
    const saved = sessionStorage.getItem("slate_viewAsRole");
    return saved ? saved as UserRole : null;
  });
  const [impersonateUserId, setImpersonateUserIdRaw] = useState<string | null>(() => {
    return sessionStorage.getItem("slate_impersonateUserId");
  });

  // Wrap setters to persist to sessionStorage
  const setViewAsRoleWrapped = useCallback((role: UserRole | null) => {
    setViewAsRole(role);
    if (role) sessionStorage.setItem("slate_viewAsRole", role);
    else sessionStorage.removeItem("slate_viewAsRole");
  }, []);

  const setImpersonateUserId = useCallback((id: string | null) => {
    setImpersonateUserIdRaw(id);
    if (id) sessionStorage.setItem("slate_impersonateUserId", id);
    else sessionStorage.removeItem("slate_impersonateUserId");
  }, []);

  // Build effective profile: impersonate > viewAs > real profile
  const effectiveProfile = useMemo(() => {
    if (!profile) return null;
    if (profile.role === "owner" && impersonateUserId) {
      const target = allProfiles.find(p => p.id === impersonateUserId);
      if (target) return { ...target, id: profile.id }; // keep owner's auth ID but use target's role, clientIds, crewMemberId
    }
    if (profile.role === "owner" && viewAsRole) {
      return { ...profile, role: viewAsRole };
    }
    return profile;
  }, [profile, viewAsRole, impersonateUserId, allProfiles]);

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
          if (p?.role === "owner") refreshProfiles();
          rememberAccountFromSession(s.user.email, p);
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
        fetchProfile(s.user.id).then(p => {
          setProfile(p);
          if (p?.role === "owner") refreshProfiles();
          rememberAccountFromSession(s.user.email, p);
        });
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile, refreshProfiles]);

  const signIn = useCallback(async (email: string, password: string) => {
    // Clear any stale impersonation from previous session
    sessionStorage.removeItem("slate_viewAsRole");
    sessionStorage.removeItem("slate_impersonateUserId");
    setViewAsRole(null);
    setImpersonateUserIdRaw(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setAllProfiles([]);
    setViewAsRole(null);
    setImpersonateUserIdRaw(null);
    sessionStorage.removeItem("slate_viewAsRole");
    sessionStorage.removeItem("slate_impersonateUserId");
  }, []);

  const createUser = useCallback(async (email: string, password: string, name: string, role: UserRole, clientIds: string[], crewMemberId?: string) => {
    // Save current session so we can restore it after signup
    const { data: currentSession } = await supabase.auth.getSession();
    const savedRefreshToken = currentSession.session?.refresh_token;

    // Sign up the new user via Supabase Auth
    // A database trigger auto-creates a default user_profiles row
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, org_id: profile?.orgId || "", _invited: true } },
    });
    if (authError) throw new Error(authError.message);
    if (!authData.user) throw new Error("Failed to create user");

    // Restore the owner's session so we don't get logged out
    if (savedRefreshToken) {
      await supabase.auth.refreshSession({ refresh_token: savedRefreshToken });
    }

    // Now update the auto-created profile with the correct role/clients/crew
    // (done as the restored owner session, which has RLS permission)
    const { error: profileError } = await supabase.from("user_profiles").update({
      name,
      role,
      client_ids: clientIds,
      crew_member_id: crewMemberId || "",
      must_change_password: true,
    }).eq("id", authData.user.id);
    if (profileError) throw new Error(profileError.message);

    await refreshProfiles();
    return authData.user.id;
  }, [refreshProfiles, profile?.orgId]);

  const updateUserProfile = useCallback(async (id: string, updates: Partial<Pick<UserProfile, "name" | "role" | "clientIds" | "crewMemberId" | "featureOverrides" | "showInMeetingAssignments">>) => {
    const patch: any = {};
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.role !== undefined) patch.role = updates.role;
    if (updates.clientIds !== undefined) patch.client_ids = updates.clientIds;
    if (updates.crewMemberId !== undefined) patch.crew_member_id = updates.crewMemberId;
    if (updates.featureOverrides !== undefined) patch.feature_overrides = updates.featureOverrides;
    if (updates.showInMeetingAssignments !== undefined) patch.show_in_meeting_assignments = updates.showInMeetingAssignments;
    const { error } = await supabase.from("user_profiles").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    await refreshProfiles();
    // If the updated profile IS the currently-logged-in user, also
    // refresh THE current `profile` state. refreshProfiles only updates
    // the `allProfiles` array; without this, customize-my-menu toggles
    // (and any other self-profile edits) silently don't take effect
    // for the user editing them.
    setProfile(p => {
      if (!p || p.id !== id) return p;
      return { ...p, ...updates } as UserProfile;
    });
  }, [refreshProfiles]);

  const deleteUser = useCallback(async (id: string) => {
    // Delete both auth user and profile via admin API
    const { data: { session: s } } = await supabase.auth.getSession();
    const token = s?.access_token;
    if (!token) throw new Error("Not authenticated");
    const res = await fetch("/api/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId: id }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed" }));
      throw new Error(err.error || "Failed to delete user");
    }
    await refreshProfiles();
  }, [refreshProfiles]);

  const changePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
    // Clear the must_change_password flag
    if (user) {
      await supabase.from("user_profiles").update({ must_change_password: false }).eq("id", user.id);
      setProfile(p => p ? { ...p, mustChangePassword: false } : p);
    }
  }, [user]);

  const completeOnboarding = useCallback(async () => {
    if (!user) throw new Error("Not authenticated");
    const { data, error } = await supabase
      .from("user_profiles")
      .update({ has_completed_onboarding: true })
      .eq("id", user.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      // Auth user exists but no user_profiles row — account is in a broken state.
      // Common cause: profile was manually deleted, or signup trigger didn't fire.
      throw new Error("Your account isn't fully set up. Please sign out and sign up again.");
    }
    setProfile(p => p ? { ...p, hasCompletedOnboarding: true } : p);
  }, [user]);

  // Staff onboarding is persisted server-side by /api/w9-submit (the final
  // step). This just clears the blocking gate locally so the staff member
  // proceeds without a full reload; the persisted value loads on next fetch.
  const completeStaffOnboarding = useCallback((completedAt: string) => {
    setProfile(p => p ? { ...p, staffOnboardingCompletedAt: completedAt } : p);
  }, []);

  const saveMyTemplates = useCallback(async (templates: PersonalEventTemplate[]) => {
    if (!user) throw new Error("Not authenticated");
    const { error } = await supabase.from("user_profiles").update({ personal_event_templates: templates }).eq("id", user.id);
    if (error) throw new Error(error.message);
    setProfile(p => p ? { ...p, personalEventTemplates: templates } : p);
  }, [user]);

  // Mark a per-page first-visit guide as seen. Idempotent — calling
  // again with the same pageId is a no-op (we keep the original
  // first-seen timestamp). Optimistic local update so the modal
  // closes instantly without waiting for the round-trip.
  // The mark-* helpers ALL await the supabase update before flipping
  // local state. The previous fire-and-forget version (`void` + setState)
  // had a real bug: if the update failed silently (RLS, network blip),
  // local state showed the modal dismissed but DB stayed stale, and
  // the modal popped right back up on next page load. Awaiting the
  // update + only updating local on success keeps the two in sync.
  const markGuideSeen = useCallback(async (pageId: string) => {
    if (!user || !profile) return;
    const seen = profile.guidance?.seenGuides || {};
    if (seen[pageId]) return;
    const nextGuidance = {
      seenGuides: { ...seen, [pageId]: new Date().toISOString() },
      businessInfoSetupSeen: profile.guidance?.businessInfoSetupSeen ?? false,
      stripeOptedOut: profile.guidance?.stripeOptedOut ?? false,
      seenTravelBaseInfo: profile.guidance?.seenTravelBaseInfo ?? false,
      manualCompletions: profile.guidance?.manualCompletions || {},
    };
    const { error } = await supabase.from("user_profiles").update({ guidance: nextGuidance }).eq("id", user.id);
    if (error) { console.error("[markGuideSeen] DB update failed:", error); return; }
    setProfile(p => p ? { ...p, guidance: nextGuidance } : p);
  }, [user, profile]);

  const markBusinessInfoSetupSeen = useCallback(async (opts?: { stripeOptedOut?: boolean }) => {
    if (!user || !profile) return;
    const nextGuidance = {
      seenGuides: profile.guidance?.seenGuides || {},
      businessInfoSetupSeen: true,
      stripeOptedOut: opts?.stripeOptedOut ?? profile.guidance?.stripeOptedOut ?? false,
      seenTravelBaseInfo: profile.guidance?.seenTravelBaseInfo ?? false,
      manualCompletions: profile.guidance?.manualCompletions || {},
    };
    const { error } = await supabase.from("user_profiles").update({ guidance: nextGuidance }).eq("id", user.id);
    if (error) { console.error("[markBusinessInfoSetupSeen] DB update failed:", error); throw new Error(error.message); }
    setProfile(p => p ? { ...p, guidance: nextGuidance } : p);
  }, [user, profile]);

  const markSeenTravelBaseInfo = useCallback(async () => {
    if (!user || !profile) return;
    if (profile.guidance?.seenTravelBaseInfo) return;
    const nextGuidance = {
      seenGuides: profile.guidance?.seenGuides || {},
      businessInfoSetupSeen: profile.guidance?.businessInfoSetupSeen ?? false,
      stripeOptedOut: profile.guidance?.stripeOptedOut ?? false,
      seenTravelBaseInfo: true,
      manualCompletions: profile.guidance?.manualCompletions || {},
    };
    const { error } = await supabase.from("user_profiles").update({ guidance: nextGuidance }).eq("id", user.id);
    if (error) { console.error("[markSeenTravelBaseInfo] DB update failed:", error); return; }
    setProfile(p => p ? { ...p, guidance: nextGuidance } : p);
  }, [user, profile]);

  return (
    <AuthContext.Provider value={{
      user, profile, session, loading,
      signIn, signOut, changePassword, completeOnboarding, completeStaffOnboarding, saveMyTemplates,
      markGuideSeen, markBusinessInfoSetupSeen, markSeenTravelBaseInfo,
      createUser, updateUserProfile, deleteUser,
      allProfiles, refreshProfiles,
      viewAsRole, setViewAsRole: setViewAsRoleWrapped, impersonateUserId, setImpersonateUserId, effectiveProfile,
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
