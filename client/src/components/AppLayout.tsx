// ============================================================
// AppLayout — Fixed sidebar + main content area
// Design: Dark Cinematic Studio | Amber accent on charcoal
// ============================================================

import { Link, useLocation } from "wouter";
import {
  CalendarDays,
  FileText,
  Users,
  MapPin,
  Settings,
  Film,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { label: "Calendar", href: "/", icon: CalendarDays },
  { label: "Retainer", href: "/invoice", icon: FileText },
  { label: "Clients", href: "/clients", icon: Users },
  { label: "Locations", href: "/locations", icon: MapPin },
  { label: "Manage", href: "/manage", icon: Settings },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col border-r border-border bg-sidebar">
        {/* Logo / Brand */}
        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-border">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
            <Film className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight truncate" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              FilmProject Pro
            </p>
            <p className="text-xs text-muted-foreground truncate">SDub Media</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-0.5">
          {navItems.map((item) => {
            const isActive = item.href === "/"
              ? location === "/"
              : location.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all duration-150 group",
                    isActive
                      ? "bg-white/8 text-foreground border-l-2 border-primary pl-[10px]"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5 border-l-2 border-transparent pl-[10px]"
                  )}
                >
                  <Icon className={cn("w-4 h-4 flex-shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {isActive && <ChevronRight className="w-3 h-3 text-primary opacity-60" />}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border">
          <p className="text-xs text-muted-foreground">Production Calendar</p>
          <p className="text-xs text-muted-foreground opacity-60">v1.0.0</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
