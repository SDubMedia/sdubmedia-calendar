// ============================================================
// AppLayout — Fixed sidebar (desktop) + hamburger menu (mobile)
// Design: Dark Cinematic Studio | Amber accent on charcoal
// Role-aware: shows/hides nav items based on user role
// ============================================================

import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  CalendarDays,
  FileText,
  Receipt,
  Users,
  Users2,
  MapPin,
  Settings,
  Film,
  Clapperboard,
  ChevronRight,
  BarChart2,
  PiggyBank,
  Shield,
  LogOut,
  Menu,
  X,
  LayoutDashboard,
  HeartPulse,
  Sun,
  Moon,
  HelpCircle,
  Car,
  TrendingUp,
  Trash2,
  MessageSquare,
  CreditCard,
  Mail,
} from "lucide-react";
import FeedbackDialog from "@/components/FeedbackDialog";
import UpgradeDialog from "@/components/UpgradeDialog";
import UpgradeSuccessDialog from "@/components/UpgradeSuccessDialog";
import PaymentBanner from "@/components/PaymentBanner";
import OverLimitBanner from "@/components/OverLimitBanner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useApp } from "@/contexts/AppContext";
import type { UserRole } from "@/lib/types";
import { useEffect, useMemo } from "react";
import GlobalSearch from "./GlobalSearch";
import NotificationBell from "./NotificationBell";
import TimerWidget from "./TimerWidget";

import type { OrgFeatures } from "@/lib/types";
import { ChevronDown } from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
  feature?: keyof OrgFeatures;
}

interface NavGroup {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
  items: NavItem[];
}

type NavEntry = NavItem | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

const navStructure: NavEntry[] = [
  // Top-level items (no group)
  { label: "Dashboard", href: "/", icon: LayoutDashboard, roles: ["owner", "partner", "client", "staff"] },
  { label: "Calendar", href: "/calendar", icon: CalendarDays, roles: ["owner", "partner", "client", "staff", "family"], feature: "calendar" },
  { label: "My Schedule", href: "/my-schedule", icon: CalendarDays, roles: ["staff"], feature: "calendar" },

  // Sales — owner and partner only
  { label: "Sales", icon: TrendingUp, roles: ["owner", "partner"], items: [
    { label: "Pipeline", href: "/pipeline", icon: Users, roles: ["owner", "partner"], feature: "pipeline" },
    { label: "Proposals", href: "/proposals", icon: FileText, roles: ["owner", "partner"], feature: "proposals" },
    { label: "Contracts", href: "/contracts", icon: FileText, roles: ["owner", "partner"], feature: "contracts" },
  ]},

  // Production — owner, partner, client (Series), staff (Series)
  { label: "Production", icon: Clapperboard, roles: ["owner", "partner", "client", "staff"], items: [
    { label: "Clients", href: "/clients", icon: Users, roles: ["owner", "partner"], feature: "clientManagement" },
    { label: "Client Health", href: "/client-health", icon: HeartPulse, roles: ["owner", "partner"], feature: "clientHealth" },
    { label: "Locations", href: "/locations", icon: MapPin, roles: ["owner"], feature: "locationManagement" },
    { label: "Series", href: "/series", icon: Clapperboard, roles: ["owner", "partner", "client", "staff"], feature: "contentSeries" },
  ]},

  // Team — owner and partner only
  { label: "Team", icon: Users2, roles: ["owner", "partner"], items: [
    { label: "Staff", href: "/staff", icon: Users2, roles: ["owner", "partner"], feature: "crewManagement" },
    { label: "Contractor Invoices", href: "/contractor-invoices", icon: Receipt, roles: ["owner", "partner"], feature: "invoicing" },
    { label: "Users", href: "/users", icon: Shield, roles: ["owner"] },
  ]},

  // Finance — owner and partner only
  { label: "Finance", icon: Receipt, roles: ["owner", "partner"], items: [
    { label: "Billing", href: "/billing", icon: FileText, roles: ["owner", "partner"], feature: "invoicing" },
    { label: "Invoices", href: "/invoices", icon: Receipt, roles: ["owner", "partner"], feature: "invoicing" },
    { label: "Expenses", href: "/expenses", icon: Receipt, roles: ["owner"], feature: "expenses" },
    { label: "Budget", href: "/marketing-budget", icon: PiggyBank, roles: ["owner", "partner"], feature: "budget" },
  ]},

  // Reports
  { label: "Reports", icon: BarChart2, roles: ["owner", "partner", "client", "staff"], items: [
    { label: "Reports", href: "/reports", icon: BarChart2, roles: ["owner", "partner"], feature: "reports" },
    { label: "P&L", href: "/profit-loss", icon: TrendingUp, roles: ["owner", "partner"], feature: "profitLoss" },
    { label: "My Reports", href: "/my-reports", icon: BarChart2, roles: ["client"], feature: "clientPortal" },
    { label: "Mileage", href: "/mileage", icon: Car, roles: ["owner", "partner", "staff"], feature: "mileage" },
    { label: "1099 Summary", href: "/1099", icon: FileText, roles: ["owner", "staff"], feature: "contractor1099" },
  ]},

  // Staff-specific
  { label: "My Invoices", href: "/my-invoices", icon: Receipt, roles: ["staff"], feature: "invoicing" },

  // Admin
  { label: "Manage", href: "/manage", icon: Settings, roles: ["owner"] },
  { label: "Calendar Sync", href: "/calendar-sync", icon: CalendarDays, roles: ["owner", "staff", "family"], feature: "calendar" },
  { label: "Trash", href: "/trash", icon: Trash2, roles: ["owner"] },
  { label: "Settings", href: "/settings", icon: Settings, roles: ["owner"] },
  { label: "Help", href: "/help", icon: HelpCircle, roles: ["owner", "partner", "client", "staff", "family"] },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { profile, effectiveProfile, signOut, viewAsRole, setViewAsRole, impersonateUserId, setImpersonateUserId, allProfiles } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { data } = useApp();
  const orgName = data.organization?.name || "Slate";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const isOwner = profile?.role === "owner";
  const role = effectiveProfile?.role ?? "client";
  const isRealOwner = profile?.role === "owner";
  const isFamily = role === "family";

  const features = data.organization?.features;
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  function toggleGroup(label: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }

  // Filter nav structure: user override → role override → global feature
  // Owner always sees everything — feature flags only affect staff/partner/client
  const userOverrides = effectiveProfile?.featureOverrides;
  const filteredNav = useMemo(() => {
    function filterItem(item: NavItem): boolean {
      const roleAllowed = item.roles.includes(role);
      if (role !== "owner" && item.feature && features) {
        // 1. Per-user override — can grant access to role-restricted features
        if (userOverrides) {
          const userVal = userOverrides[item.feature];
          if (userVal !== undefined) {
            if (!userVal) return false; // explicitly disabled
            // Override grants feature access, but skip role-specific views
            // (e.g. "My Schedule" is staff-only even if calendar override is on)
            if (!roleAllowed && item.href?.startsWith("/my-")) return false;
            return true;
          }
        }
        // 2. Role gate — only applies when no per-user override exists
        if (!roleAllowed) return false;
        // 3. Per-role override
        const roleOverrides = role === "staff" ? features.staffFeatures
          : role === "partner" ? features.partnerFeatures
          : role === "client" ? features.clientFeatures
          : role === "family" ? features.familyFeatures
          : undefined;
        if (roleOverrides) {
          const override = (roleOverrides as Record<string, boolean>)[item.feature];
          if (!(override ?? features[item.feature as keyof typeof features])) return false;
        } else if (!features[item.feature as keyof typeof features]) {
          return false;
        }
      } else if (!roleAllowed) {
        return false;
      }
      return true;
    }
    return navStructure
      .filter(entry => {
        if (isGroup(entry)) {
          // Don't gate groups by role — let child filterItem decide (per-user overrides can grant access)
          return entry.items.some(filterItem);
        }
        return filterItem(entry);
      })
      .map(entry => {
        if (isGroup(entry)) {
          return { ...entry, items: entry.items.filter(filterItem) };
        }
        return entry;
      });
  }, [role, features, userOverrides]);

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  // Auto-expand group if active page is inside it
  useEffect(() => {
    const matchesActive = (href: string) => href === "/" ? location === "/" : location.startsWith(href);
    for (const entry of filteredNav) {
      if (isGroup(entry) && entry.items.some(item => matchesActive(item.href))) {
        setExpandedGroups(prev => {
          if (prev.has(entry.label)) return prev;
          const next = new Set(prev);
          next.add(entry.label);
          return next;
        });
      }
    }
  }, [location, filteredNav]);

  return (
    <div className="flex overflow-hidden bg-background" style={{ height: '100dvh' }}>
      {/* ---- Desktop Sidebar ---- */}
      <aside className="hidden md:flex w-56 flex-shrink-0 flex-col border-r border-border bg-sidebar">
        {/* Logo / Brand */}
        <Link href="/">
          <div className="flex items-center gap-2.5 px-4 py-5 border-b border-border cursor-pointer hover:bg-white/5 transition-colors">
            <img src="/pwa-192x192.png" alt="Slate" className="w-8 h-8 rounded-md flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground leading-tight truncate" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {orgName}
              </p>
              <p className="text-xs text-muted-foreground truncate">{profile?.name || "SDub Media"}</p>
            </div>
          </div>
        </Link>

        {/* Search + Notifications + Timer */}
        <div className="px-3 pt-3 flex items-center gap-2">
          <div className="flex-1"><GlobalSearch /></div>
          <NotificationBell />
        </div>
        <div className="px-3 pt-2">
          <TimerWidget />
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
          {filteredNav.map((entry) => {
            if (isGroup(entry)) {
              const expanded = expandedGroups.has(entry.label);
              const groupActive = entry.items.some(item => isActive(item.href));
              const GroupIcon = entry.icon;
              return (
                <div key={entry.label}>
                  <button
                    onClick={() => toggleGroup(entry.label)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all duration-150 w-full group",
                      groupActive
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    )}
                  >
                    <GroupIcon className={cn("w-4 h-4 flex-shrink-0", groupActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                    <span className="flex-1 truncate text-left">{entry.label}</span>
                    <ChevronDown className={cn("w-3 h-3 transition-transform", expanded ? "rotate-0" : "-rotate-90")} />
                  </button>
                  {expanded && (
                    <div className="ml-4 pl-3 border-l border-border/50 space-y-0.5 mt-0.5 mb-1">
                      {entry.items.map(item => {
                        const active = isActive(item.href);
                        const Icon = item.icon;
                        return (
                          <Link key={item.href} href={item.href}>
                            <div className={cn(
                              "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-150 group",
                              active
                                ? "bg-white/8 text-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                            )}>
                              <Icon className={cn("w-3.5 h-3.5 flex-shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                              <span className="flex-1 truncate">{item.label}</span>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            const item = entry as NavItem;
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all duration-150 group",
                    active
                      ? "bg-white/8 text-foreground border-l-2 border-primary pl-[10px]"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5 border-l-2 border-transparent pl-[10px]"
                  )}
                >
                  <Icon className={cn("w-4 h-4 flex-shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {active && <ChevronRight className="w-3 h-3 text-primary opacity-60" />}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border space-y-2">
          {toggleTheme && (
            <button onClick={toggleTheme} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full">
              {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </button>
          )}
          {isRealOwner && (
            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">View As</label>
                <select
                  value={viewAsRole || ""}
                  onChange={e => { setImpersonateUserId(null); setViewAsRole(e.target.value ? e.target.value as any : null); setLocation("/"); }}
                  className="w-full bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground"
                >
                  <option value="">Owner (default)</option>
                  <option value="partner">Partner</option>
                  <option value="client">Client</option>
                  <option value="staff">Staff</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Impersonate User</label>
                <select
                  value={impersonateUserId || ""}
                  onChange={e => { setViewAsRole(null); setImpersonateUserId(e.target.value || null); setLocation("/"); }}
                  className="w-full bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground"
                >
                  <option value="">None</option>
                  {allProfiles.filter(p => p.id !== profile?.id).map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.role})</option>
                  ))}
                </select>
              </div>
              {impersonateUserId && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-md px-2 py-1">
                  <p className="text-[10px] text-amber-300">Impersonating: {allProfiles.find(p => p.id === impersonateUserId)?.name}</p>
                </div>
              )}
            </div>
          )}
          {isOwner && (
            <button
              onClick={() => setUpgradeOpen(true)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              <CreditCard className="w-3.5 h-3.5" />
              Subscription
            </button>
          )}
          {!isFamily && (
            <>
              <button
                onClick={() => setFeedbackOpen(true)}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Send Feedback
              </button>
              <a
                href="mailto:support@sdubmedia.com?subject=Slate%20support"
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                <Mail className="w-3.5 h-3.5" />
                Contact Support
              </a>
            </>
          )}
          <button
            onClick={() => signOut()}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ---- Main content ---- */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar — extra top padding for status bar/notch */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-sidebar flex-shrink-0" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
          <Link href="/">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
                <Film className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  {orgName}
                </p>
                <p className="text-xs text-muted-foreground">{profile?.name || "SDub Media"}</p>
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-1">
            <TimerWidget />
            <NotificationBell />
            <button
              onClick={() => setMobileMenuOpen(o => !o)}
              className="text-muted-foreground hover:text-foreground p-2"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile slide-down menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-sidebar border-b border-border z-40 max-h-[80vh] overflow-auto" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            <nav className="py-2 px-3 space-y-0.5">
              {filteredNav.map((entry) => {
                if (isGroup(entry)) {
                  const expanded = expandedGroups.has(entry.label);
                  const groupActive = entry.items.some(item => isActive(item.href));
                  const GroupIcon = entry.icon;
                  return (
                    <div key={entry.label}>
                      <button
                        onClick={() => toggleGroup(entry.label)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-3 rounded-md text-sm transition-colors w-full",
                          groupActive ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                        )}
                      >
                        <GroupIcon className={cn("w-4 h-4", groupActive ? "text-primary" : "text-muted-foreground")} />
                        <span className="flex-1 text-left">{entry.label}</span>
                        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expanded ? "rotate-0" : "-rotate-90")} />
                      </button>
                      {expanded && (
                        <div className="ml-4 pl-3 border-l border-border/50 space-y-0.5 mb-1">
                          {entry.items.map(item => {
                            const active = isActive(item.href);
                            const Icon = item.icon;
                            return (
                              <Link key={item.href} href={item.href}>
                                <div
                                  onClick={() => setMobileMenuOpen(false)}
                                  className={cn(
                                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                                    active ? "bg-white/8 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                                  )}
                                >
                                  <Icon className={cn("w-3.5 h-3.5", active ? "text-primary" : "text-muted-foreground")} />
                                  <span className="flex-1">{item.label}</span>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }
                const item = entry as NavItem;
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href}>
                    <div
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-3 rounded-md text-sm transition-colors",
                        active ? "bg-white/8 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                      )}
                    >
                      <Icon className={cn("w-4 h-4", active ? "text-primary" : "text-muted-foreground")} />
                      <span className="flex-1">{item.label}</span>
                      {active && <ChevronRight className="w-3 h-3 text-primary opacity-60" />}
                    </div>
                  </Link>
                );
              })}
              {toggleTheme && (
                <button onClick={() => { toggleTheme(); setMobileMenuOpen(false); }}
                  className="flex items-center gap-3 px-3 py-3 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 w-full">
                  {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
                </button>
              )}
              {isRealOwner && (
                <div className="px-3 py-2 space-y-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">View As</label>
                    <select
                      value={viewAsRole || ""}
                      onChange={e => { setImpersonateUserId(null); setViewAsRole(e.target.value ? e.target.value as any : null); setMobileMenuOpen(false); setLocation("/"); }}
                      className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm text-foreground"
                    >
                      <option value="">Owner (default)</option>
                      <option value="partner">Partner</option>
                      <option value="client">Client</option>
                      <option value="staff">Staff</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Impersonate</label>
                    <select
                      value={impersonateUserId || ""}
                      onChange={e => { setViewAsRole(null); setImpersonateUserId(e.target.value || null); setMobileMenuOpen(false); setLocation("/"); }}
                      className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm text-foreground"
                    >
                      <option value="">None</option>
                      {allProfiles.filter(p => p.id !== profile?.id).map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.role})</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              {isOwner && (
                <button
                  onClick={() => { setMobileMenuOpen(false); setUpgradeOpen(true); }}
                  className="flex items-center gap-3 px-3 py-3 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 w-full"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Subscription</span>
                </button>
              )}
              {!isFamily && (
                <>
                  <button
                    onClick={() => { setMobileMenuOpen(false); setFeedbackOpen(true); }}
                    className="flex items-center gap-3 px-3 py-3 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 w-full"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Send Feedback</span>
                  </button>
                  <a
                    href="mailto:support@sdubmedia.com?subject=Slate%20support"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 w-full"
                  >
                    <Mail className="w-4 h-4" />
                    <span>Contact Support</span>
                  </a>
                </>
              )}
              <button
                onClick={() => { setMobileMenuOpen(false); signOut(); }}
                className="flex items-center gap-3 px-3 py-3 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 w-full"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </nav>
          </div>
        )}

        {/* Owner-only SaaS billing banners (only render when applicable) */}
        <PaymentBanner />
        <OverLimitBanner />

        {/* Post-checkout celebration (reads ?upgraded= param) */}
        <UpgradeSuccessDialog />

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <UpgradeDialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}
