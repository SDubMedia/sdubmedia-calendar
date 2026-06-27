// ============================================================
// ExternalCalendarsCard — Settings UI for subscribing to external
// iCal feeds (Apple Calendar published URLs, etc.). Owner pastes
// a webcal:// URL, picks a label + color, and Slate fetches the
// events and shows them on My Life. Refreshed every 30 min by
// cron; manual refresh + toggle + delete also live here.
// ============================================================

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useConfirm } from "@/components/ConfirmProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarPlus, RefreshCw, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { getAuthToken, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const COLOR_OPTIONS = [
  "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#94a3b8",
];

export default function ExternalCalendarsCard() {
  const { data } = useApp();
  const confirm = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const calendars = data.externalCalendars;

  async function handleAdd() {
    if (!url.trim()) { toast.error("Paste a calendar URL first"); return; }
    setBusy(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/external-calendar-add", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label: label.trim() || "External calendar", url: url.trim(), color }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to add");
      }
      const body = await res.json();
      if (body.syncResult?.ok) {
        toast.success(`Calendar added — ${body.syncResult.count} events imported`);
      } else if (body.syncResult?.error) {
        toast.error(`Calendar added but first sync failed: ${body.syncResult.error}`);
      } else {
        toast.success("Calendar added");
      }
      setShowForm(false);
      setLabel(""); setUrl(""); setColor(COLOR_OPTIONS[0]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setBusy(false);
    }
  }

  async function handleRefresh(id: string) {
    setRefreshing(id);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/external-calendar-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ externalCalendarId: id }),
      });
      const body = await res.json();
      if (body.ok) toast.success(`Refreshed — ${body.count} events`);
      else toast.error(body.error || "Refresh failed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(null);
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    const { error } = await supabase.from("external_calendars").update({ enabled }).eq("id", id);
    if (error) toast.error(error.message);
  }

  async function handleDelete(id: string, label: string) {
    if (!(await confirm({ title: "Remove calendar?", description: `Remove "${label}"? Events from this calendar will disappear from your Slate calendar.`, destructive: true, confirmLabel: "Remove" }))) return;
    const { error } = await supabase.from("external_calendars").delete().eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Calendar removed");
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          <CalendarPlus className="w-4 h-4 text-primary" />
          Import External Calendars
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Subscribe to a published iCal feed (e.g. your Apple Calendar) and Slate will show those events on your My Life calendar. Refreshed every 30 minutes.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">

        {calendars.length === 0 && !showForm && (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground space-y-2">
            <p>No external calendars yet.</p>
            <p className="text-xs">
              <strong className="text-foreground">To get an Apple Calendar URL:</strong> open Calendar app → right-click your calendar → Share Calendar → check Public Calendar → copy the <code className="text-primary">webcal://</code> URL.
            </p>
          </div>
        )}

        {calendars.map(cal => (
          <div key={cal.id} className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
            <div className="flex items-start gap-3">
              <span className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ backgroundColor: cal.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-foreground truncate">{cal.label}</span>
                  {!cal.enabled && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Disabled</span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">{cal.url}</div>
                <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5">
                  {cal.lastError ? (
                    <>
                      <AlertCircle className="w-3 h-3 text-destructive shrink-0" />
                      <span className="text-destructive truncate">{cal.lastError}</span>
                    </>
                  ) : cal.lastSyncedAt ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span>{cal.eventCount} events · synced {new Date(cal.lastSyncedAt).toLocaleString()}</span>
                    </>
                  ) : (
                    <span className="italic">Never synced</span>
                  )}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => handleRefresh(cal.id)}
                  disabled={refreshing === cal.id}
                  className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                  title="Refresh now"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", refreshing === cal.id && "animate-spin")} />
                </button>
                <button
                  onClick={() => handleToggle(cal.id, !cal.enabled)}
                  className={cn(
                    "px-2 py-1 rounded text-[10px] font-medium transition-colors",
                    cal.enabled
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25"
                      : "bg-muted text-muted-foreground border border-border hover:bg-muted/80",
                  )}
                >
                  {cal.enabled ? "On" : "Off"}
                </button>
                <button
                  onClick={() => handleDelete(cal.id, cal.label)}
                  className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {showForm ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Calendar URL</Label>
              <Input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="webcal://p01-caldav.icloud.com/..."
                className="bg-secondary border-border text-sm"
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground">
                Paste a <code>webcal://</code> or <code>https://</code> URL from any calendar app's "Public Calendar" share option.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Label</Label>
              <Input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Personal · Family · Work"
                className="bg-secondary border-border text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Color</Label>
              <div className="flex gap-2">
                {COLOR_OPTIONS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      "w-6 h-6 rounded-full border-2 transition-transform",
                      color === c ? "border-foreground scale-110" : "border-transparent hover:scale-105",
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setLabel(""); setUrl(""); }} disabled={busy}>Cancel</Button>
              <Button size="sm" onClick={handleAdd} disabled={busy || !url.trim()}>
                {busy ? "Adding…" : "Add Calendar"}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
            <CalendarPlus className="w-3.5 h-3.5" /> Add a calendar
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
