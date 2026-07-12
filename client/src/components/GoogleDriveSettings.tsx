// ============================================================
// GoogleDriveSettings — owner connects/disconnects their Google Drive so
// delivered galleries can be archived there ("Send to Drive" on a gallery).
// drive.file scope: Slate only ever sees the "Slate Galleries" folder it makes.
// ============================================================

import { useEffect, useState } from "react";
import { HardDrive, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/AppContext";
import { getAuthToken } from "@/lib/supabase";
import { toast } from "sonner";

export default function GoogleDriveSettings() {
  const { data, refresh } = useApp();
  const connectedEmail = data.organization?.googleDriveEmail || "";
  const [busy, setBusy] = useState(false);

  // Handle the redirect back from Google (/manage?tab=settings&drive=...).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const status = q.get("drive");
    if (!status) return;
    if (status === "connected") toast.success("Google Drive connected");
    else if (status === "denied") toast.error("Google Drive access was declined");
    else if (status === "error") toast.error("Couldn't connect Google Drive — try again");
    q.delete("drive");
    window.history.replaceState({}, "", window.location.pathname + (q.toString() ? `?${q}` : ""));
    if (status === "connected") refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/google-drive-connect", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => ({ error: "Failed" }));
      if (!res.ok) throw new Error(body.error || "Couldn't start connection");
      window.location.assign(body.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't connect Google Drive");
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/google-drive-disconnect", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const b = await res.json().catch(() => ({ error: "Failed" })); throw new Error(b.error || "Couldn't disconnect"); }
      await refresh();
      toast.success("Google Drive disconnected");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't disconnect");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4 overflow-hidden">
      <div className="flex items-center gap-2 mb-2">
        <HardDrive className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-foreground">Google Drive archiving</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Connect your Google Drive to archive delivered galleries — each goes into a <span className="text-foreground">Slate Galleries</span> folder with a subfolder per property. Slate only ever sees the folders it creates.
      </p>
      {connectedEmail ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-green-500 flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Connected as {connectedEmail}</span>
          <Button size="sm" variant="outline" onClick={disconnect} disabled={busy} className="border-border">
            {busy ? "…" : "Disconnect"}
          </Button>
        </div>
      ) : (
        <Button size="sm" onClick={connect} disabled={busy} className="gap-2">
          <HardDrive className="w-4 h-4" /> {busy ? "Opening…" : "Connect Google Drive"}
        </Button>
      )}
    </div>
  );
}
