// ============================================================
// NotificationBell — In-app notification dropdown
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { Bell } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/lib/types";

function rowToNotification(r: any): AppNotification {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type || "",
    title: r.title || "",
    message: r.message || "",
    link: r.link || "",
    read: r.read ?? false,
    createdAt: r.created_at,
  };
}

export default function NotificationBell() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setNotifications(data.map(rowToNotification));
  }, [user]);

  useEffect(() => {
    fetchNotifications();
    // Poll every 30 seconds for new notifications
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleClick = (n: AppNotification) => {
    markRead(n.id);
    if (n.link) setLocation(n.link);
    setOpen(false);
  };

  const typeIcons: Record<string, string> = {
    assignment: "📋",
    review: "👀",
    delivery: "📦",
    comment: "💬",
    invoice: "💰",
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`relative p-2 transition-colors ${
          unreadCount > 0
            ? "text-primary hover:text-primary/80"
            : "text-muted-foreground hover:text-foreground"
        }`}
        aria-label={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}` : "Notifications"}
      >
        <Bell className={`w-4 h-4 ${unreadCount > 0 ? "animate-pulse" : ""}`} />
        {unreadCount > 0 && (
          <>
            {/* Soft halo behind the badge — gives the bell a noticeable
                "pop" without going full-circus animation. */}
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary/40 rounded-full blur-[2px] animate-pulse" />
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-background">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          </>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Anchor to the bell's LEFT edge so the dropdown extends
              rightward into the main content area. (Anchoring to the
              right would clip the dropdown's left edge against the
              screen edge, since the sidebar is only 224px wide and the
              dropdown is 320px.) */}
          {/* On mobile (no sidebar) anchor right so the dropdown grows leftward
              into the visible area. On sm+ (sidebar present), keep the original
              left-anchor so the dropdown clears the sidebar instead of clipping. */}
          <div className="absolute right-0 sm:left-0 sm:right-auto top-full mt-1 w-80 max-w-[calc(100vw-1rem)] max-h-96 overflow-y-auto overflow-x-hidden bg-card border border-border rounded-xl shadow-xl z-50">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-xs font-semibold text-foreground">Notifications</span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-[10px] text-primary hover:text-primary/80">
                  Mark all read
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">No notifications</div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 border-b border-border last:border-0 hover:bg-secondary/50 transition-colors",
                    !n.read && "bg-primary/5"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm shrink-0">{typeIcons[n.type] || "🔔"}</span>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-xs truncate", !n.read ? "text-foreground font-medium" : "text-muted-foreground")}>
                        {n.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground/70 truncate">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                        {new Date(n.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />}
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
