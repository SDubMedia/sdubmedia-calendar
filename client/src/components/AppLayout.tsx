// ============================================================
// AppLayout — Fixed sidebar (desktop) + bottom tab bar (mobile)
// Design: Dark Cinematic Studio | Amber accent on charcoal
// Role-aware: shows/hides nav items based on user role
// ============================================================

import { Link, useLocation } from "wouter";
import {
  CalendarDays,
  FileText,
  Users,
  Users2,
  MapPin,
  Settings,
  Film,
  ChevronRight,
  BarChart2,
  PiggyBank,
  Shield,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/lib/types";
import { useMemo } from "react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[]; // which roles can see this item
}

const allNavItems: NavItem[] = [
  { label: "Calendar", href: "/", icon: CalendarDays, roles: ["owner", "partner", "client"] },
  { label: "Billing", href: "/billing", icon: FileText, roles: ["owner", "partner"] },
  { label: "Reports", href: "/reports", icon: BarChart2, roles: ["owner", "partner", "client"] },
  { label: "Clients", href: "/clients", icon: Users, roles: ["owner", "partner"] },
  { label: "Staff", href: "/staff", icon: Users2, roles: ["owner", "partner"] },
  { label: "Budget", href: "/marketing-budget", icon: PiggyBank, roles: ["owner", "partner"] },
  { label: "Locations", href: "/locations", icon: MapPin, roles: ["owner"] },
  { label: "Manage", href: "/manage", icon: Settings, roles: ["owner"] },
  { label: "Users", href: "/users", icon: Shield, roles: ["owner"] },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { profile, signOut } = useAuth();
  const role = profile?.role ?? "client";

  const navItems = useMemo(() =>
    allNavItems.filter(item => item.roles.includes(role)),
    [role]
  );

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  return (
    <div className="flex overflow-hidden bg-background" style={{ height: '100dvh' }}>
      {/* ---- Desktop Sidebar ---- */}
      <aside className="hidden md:flex w-56 flex-shrink-0 flex-col border-r border-border bg-sidebar">
        {/* Logo / Brand */}
        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-border">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
            <Film className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight truncate" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              FilmProject Pro
            </p>
            <p className="text-xs text-muted-foreground truncate">{profile?.name || "SDub Media"}</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
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

        {/* Footer with sign out */}
        <div className="px-4 py-3 border-t border-border">
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
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-sidebar flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
              <Film className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                FilmProject Pro
              </p>
              <p className="text-xs text-muted-foreground">{profile?.name || "SDub Media"}</p>
            </div>
          </div>
          <button onClick={() => signOut()} className="text-muted-foreground hover:text-foreground p-2">
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Page content — scrollable, padded for bottom nav on mobile */}
        <main className="flex-1 overflow-auto pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>

        {/* ---- Mobile Bottom Tab Bar ---- */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-sidebar border-t border-border z-50 safe-area-bottom">
          <div className={cn("grid h-14", `grid-cols-${Math.min(navItems.length, 6)}`)}>
            {navItems.slice(0, 6).map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <div className={cn(
                    "flex flex-col items-center justify-center h-full gap-0.5 transition-colors cursor-pointer relative",
                    active ? "text-primary" : "text-muted-foreground"
                  )}>
                    {active && (
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />
                    )}
                    <Icon className="w-5 h-5" />
                    <span className="text-[9px] font-medium leading-none">{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
