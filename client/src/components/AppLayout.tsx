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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useApp } from "@/contexts/AppContext";
import type { UserRole } from "@/lib/types";
import { useEffect, useMemo } from "react";
import GlobalSearch from "./GlobalSearch";
import NotificationBell from "./NotificationBell";

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
  { label: "Calendar", href: "/calendar", icon: CalendarDays, roles: ["owner", "partner", "client"], feature: "calendar" },
  { label: "My Schedule", href: "/my-schedule", icon: CalendarDays, roles: ["staff"], feature: "calendar" },

  // Production
  { label: "Production", icon: Clapperboard, roles: ["owner", "partner", "client"], items: [
    { label: "Clients", href: "/clients", icon: Users, roles: ["owner", "partner"] },
    { label: "Client Health", href: "/client-health", icon: HeartPulse, roles: ["owner", "partner"] },
    { label: "Locations", href: "/locations", icon: MapPin, roles: ["owner"] },
    { label: "Series", href: "/series", icon: Clapperboard, roles: ["owner", "partner", "client"], feature: "contentSeries" },
  ]},

  // Team
  { label: "Team", icon: Users2, roles: ["owner", "partner"], items: [
    { label: "Staff", href: "/staff", icon: Users2, roles: ["owner", "partner"], feature: "crewManagement" },
    { label: "1099 Summary", href: "/1099", icon: FileText, roles: ["owner"], feature: "crewManagement" },
    { label: "Contractor Invoices", href: "/contractor-invoices", icon: Receipt, roles: ["owner", "partner"], feature: "invoicing" },
    { label: "Users", href: "/users", icon: Shield, roles: ["owner"] },
  ]},

  // Finance
  { label: "Finance", icon: FileText, roles: ["owner", "partner"], items: [
    { label: "Billing", href: "/billing", icon: FileText, roles: ["owner", "partner"], feature: "invoicing" },
    { label: "Invoices", href: "/invoices", icon: Receipt, roles: ["owner", "partner"], feature: "invoicing" },
    { label: "Expenses", href: "/expenses", icon: Receipt, roles: ["owner"], feature: "expenses" },
    { label: "P&L", href: "/profit-loss", icon: TrendingUp, roles: ["owner", "partner"] },
    { label: "Budget", href: "/marketing-budget", icon: PiggyBank, roles: ["owner", "partner"], feature: "partnerSplits" },
  ]},

  // Reports & Tracking
  { label: "Reports", icon: BarChart2, roles: ["owner", "partner", "client", "staff"], items: [
    { label: "Reports", href: "/reports", icon: BarChart2, roles: ["owner", "partner"] },
    { label: "My Reports", href: "/my-reports", icon: BarChart2, roles: ["client"], feature: "clientPortal" },
    { label: "Mileage", href: "/mileage", icon: Car, roles: ["owner", "partner", "staff"], feature: "mileage" },
  ]},

  // Staff-specific
  { label: "My Invoices", href: "/my-invoices", icon: Receipt, roles: ["staff"], feature: "invoicing" },

  // Admin
  { label: "Manage", href: "/manage", icon: Settings, roles: ["owner"] },
  { label: "Settings", href: "/settings", icon: Settings, roles: ["owner"] },
  { label: "Help", href: "/help", icon: HelpCircle, roles: ["owner", "partner", "client", "staff"] },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { profile, effectiveProfile, signOut, viewAsRole, setViewAsRole } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { data } = useApp();
  const orgName = data.organization?.name || "Slate";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const role = effectiveProfile?.role ?? "client";
  const isRealOwner = profile?.role === "owner";

  const features = data.organization?.features;
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  function toggleGroup(label: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }

  // Filter nav structure based on role and features
  // Owner always sees everything — feature flags only affect staff/partner/client
  const filteredNav = useMemo(() => {
    function filterItem(item: NavItem): boolean {
      if (!item.roles.includes(role)) return false;
      if (role !== "owner" && item.feature && features && !features[item.feature]) return false;
      return true;
    }
    return navStructure
      .filter(entry => {
        if (isGroup(entry)) {
          if (!entry.roles.some(r => r === role)) return false;
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
  }, [role, features]);

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  // Auto-expand group if active page is inside it
  useEffect(() => {
    for (const entry of filteredNav) {
      if (isGroup(entry) && entry.items.some(item => isActive(item.href))) {
        setExpandedGroups(prev => {
          if (prev.has(entry.label)) return prev;
          const next = new Set(prev);
          next.add(entry.label);
          return next;
        });
      }
    }
  }, [location]);

  return (
    <div className="flex overflow-hidden bg-background" style={{ height: '100dvh' }}>
      {/* ---- Desktop Sidebar ---- */}
      <aside className="hidden md:flex w-56 flex-shrink-0 flex-col border-r border-border bg-sidebar">
        {/* Logo / Brand */}
        <Link href="/">
          <div className="flex items-center gap-2.5 px-4 py-5 border-b border-border cursor-pointer hover:bg-white/5 transition-colors">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
              <Film className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground leading-tight truncate" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {orgName}
              </p>
              <p className="text-xs text-muted-foreground truncate">{profile?.name || "SDub Media"}</p>
            </div>
          </div>
        </Link>

        {/* Search + Notifications */}
        <div className="px-3 pt-3 flex items-center gap-2">
          <div className="flex-1"><GlobalSearch /></div>
          <NotificationBell />
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
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">View As</label>
              <select
                value={viewAsRole || ""}
                onChange={e => setViewAsRole(e.target.value ? e.target.value as any : null)}
                className="w-full bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground"
              >
                <option value="">Owner (default)</option>
                <option value="partner">Partner</option>
                <option value="client">Client</option>
                <option value="staff">Staff</option>
              </select>
            </div>
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
                <div className="px-3 py-2">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">View As</label>
                  <select
                    value={viewAsRole || ""}
                    onChange={e => { setViewAsRole(e.target.value ? e.target.value as any : null); setMobileMenuOpen(false); }}
                    className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm text-foreground"
                  >
                    <option value="">Owner (default)</option>
                    <option value="partner">Partner</option>
                    <option value="client">Client</option>
                    <option value="staff">Staff</option>
                  </select>
                </div>
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

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
