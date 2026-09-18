// ============================================================
// QrCodesPage — dynamic QR codes (owner only)
//
// Each code is a permanent Slate link (/q/<code>) that forwards to whatever
// website Geoff points it at today. Print the QR once, re-point it forever.
// Lock freezes a code: no link edits, no delete, until it's unlocked. The
// lock is also enforced by a database trigger, so the UI is a convenience,
// not the guard.
//
// Design: Dark Cinematic Studio
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Lock, Unlock, Edit3, Trash2, Copy, Download, ExternalLink, ScanLine, RefreshCw } from "lucide-react";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { publicUrl, qrImageUrl } from "@/lib/publicUrl";
import { displayUrl, normalizeTargetUrl, qrPath } from "@/lib/qr";
import { toast } from "sonner";

interface QrCode {
  id: string;
  code: string;
  name: string;
  targetUrl: string;
  locked: boolean;
  scanCount: number;
  lastScannedAt: string | null;
  createdAt: string;
}

function rowToQrCode(r: any): QrCode {
  return {
    id: r.id,
    code: r.code || "",
    name: r.name || "",
    targetUrl: r.target_url || "",
    locked: !!r.locked,
    scanCount: Number(r.scan_count ?? 0),
    lastScannedAt: r.last_scanned_at || null,
    createdAt: r.created_at || "",
  };
}

interface FormData { name: string; targetUrl: string }
const emptyForm: FormData = { name: "", targetUrl: "" };

export default function QrCodesPage() {
  const { profile } = useAuth();
  const orgId = profile?.orgId || "";
  const [codes, setCodes] = useState<QrCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<QrCode | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QrCode | null>(null);
  const [viewing, setViewing] = useState<QrCode | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("qr_codes").select("*").order("created_at", { ascending: false });
    if (error) { toast.error(`Couldn't load QR codes: ${error.message}`); return; }
    setCodes((data || []).map(rowToQrCode));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [load]);

  const openAdd = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (c: QrCode) => { setEditing(c); setForm({ name: c.name, targetUrl: c.targetUrl }); setDialogOpen(true); };

  const save = async () => {
    const target = normalizeTargetUrl(form.targetUrl);
    if (!target) { toast.error("Enter a web address, like sdubmedia.com/weddings"); return; }
    const name = form.name.trim() || displayUrl(target);
    setSaving(true);
    try {
      if (editing) {
        const { data, error } = await supabase.from("qr_codes")
          .update({ name, target_url: target, updated_at: new Date().toISOString() })
          .eq("id", editing.id).select().single();
        if (error) throw new Error(error.message);
        const updated = rowToQrCode(data);
        setCodes(cs => cs.map(c => c.id === updated.id ? updated : c));
        toast.success("Link updated. The printed code now goes there.");
      } else {
        const { data, error } = await supabase.from("qr_codes")
          .insert({ id: nanoid(10), org_id: orgId, code: nanoid(8), name, target_url: target })
          .select().single();
        if (error) throw new Error(error.message);
        const created = rowToQrCode(data);
        setCodes(cs => [created, ...cs]);
        setViewing(created);
        toast.success("QR code created");
      }
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const toggleLock = async (c: QrCode) => {
    const { data, error } = await supabase.from("qr_codes")
      .update({ locked: !c.locked, updated_at: new Date().toISOString() })
      .eq("id", c.id).select().single();
    if (error) { toast.error(error.message); return; }
    const updated = rowToQrCode(data);
    setCodes(cs => cs.map(x => x.id === updated.id ? updated : x));
    toast.success(updated.locked ? "Locked. The link can't change until you unlock it." : "Unlocked");
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("qr_codes").delete().eq("id", deleteTarget.id);
    if (error) { toast.error(error.message); return; }
    setCodes(cs => cs.filter(c => c.id !== deleteTarget.id));
    setDeleteTarget(null);
    toast.success("Deleted. Anything printed with that code now shows a 'nothing here' page.");
  };

  const copyLink = async (c: QrCode) => {
    try {
      await navigator.clipboard.writeText(publicUrl(qrPath(c.code)));
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. The link is " + publicUrl(qrPath(c.code)));
    }
  };

  const totalScans = useMemo(() => codes.reduce((n, c) => n + c.scanCount, 0), [codes]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-border bg-card/50">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>QR Codes</h1>
          <p className="text-sm text-muted-foreground">
            Print a code once, point it anywhere, change the link whenever you like.
            {codes.length > 0 && <> {codes.length} code{codes.length === 1 ? "" : "s"} · {totalScans} scan{totalScans === 1 ? "" : "s"}.</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={load} title="Refresh scan counts">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={openAdd} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
            <Plus className="w-4 h-4" /> New QR Code
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : codes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
            <ScanLine className="w-10 h-10 opacity-40" />
            <p className="text-sm">No QR codes yet. Make one, print it, and re-point it any time.</p>
            <Button onClick={openAdd} variant="outline" className="gap-2"><Plus className="w-4 h-4" /> New QR Code</Button>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
            {codes.map(c => (
              <div key={c.id} className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3 min-w-0">
                <div className="flex items-start gap-3 min-w-0">
                  <button onClick={() => setViewing(c)} className="shrink-0 rounded-md bg-white p-1" title="Open QR">
                    <img src={qrImageUrl(qrPath(c.code), 240)} alt={`QR for ${c.name}`} className="w-20 h-20" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="font-medium text-foreground truncate">{c.name}</h3>
                      {c.locked && <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                    </div>
                    <a href={c.targetUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline break-all inline-flex items-center gap-1 max-w-full">
                      <span className="truncate">{displayUrl(c.targetUrl)}</span><ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                    <p className="text-xs text-muted-foreground mt-1">
                      {c.scanCount} scan{c.scanCount === 1 ? "" : "s"}
                      {c.lastScannedAt && <> · last {new Date(c.lastScannedAt).toLocaleDateString()}</>}
                    </p>
                    <p className="text-[11px] text-muted-foreground/70 font-mono truncate">/q/{c.code}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openEdit(c)} disabled={c.locked} title={c.locked ? "Unlock to change the link" : "Change the link"}>
                    <Edit3 className="w-3.5 h-3.5" /> Link
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => toggleLock(c)}>
                    {c.locked ? <><Unlock className="w-3.5 h-3.5" /> Unlock</> : <><Lock className="w-3.5 h-3.5" /> Lock</>}
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => copyLink(c)}>
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" asChild>
                    <a href={qrImageUrl(qrPath(c.code), 1200)} download={`qr-${c.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || c.code}.png`}>
                      <Download className="w-3.5 h-3.5" /> PNG
                    </a>
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive ml-auto" onClick={() => setDeleteTarget(c)} disabled={c.locked} title={c.locked ? "Unlock to delete" : "Delete"}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Change the link" : "New QR code"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="qr-name">Name</Label>
              <Input id="qr-name" placeholder="Front window sign" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Just for you, so you know which printed code this is.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qr-url">Sends people to</Label>
              <Input id="qr-url" placeholder="sdubmedia.com/weddings" value={form.targetUrl} inputMode="url" autoCapitalize="off"
                onChange={e => setForm(f => ({ ...f, targetUrl: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") void save(); }} />
              {editing && <p className="text-xs text-muted-foreground">The printed code stays the same. Only where it goes changes.</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {saving ? "Saving…" : editing ? "Save link" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Big QR for printing / screenshotting */}
      <Dialog open={!!viewing} onOpenChange={o => { if (!o) setViewing(null); }}>
        <DialogContent className="sm:max-w-sm">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="truncate">{viewing.name}</DialogTitle>
              </DialogHeader>
              <img src={qrImageUrl(qrPath(viewing.code), 600)} alt={`QR for ${viewing.name}`} className="w-60 h-60 mx-auto rounded-lg bg-white p-2" />
              <p className="text-xs text-center text-muted-foreground break-all">{publicUrl(qrPath(viewing.code))}</p>
              <p className="text-xs text-center text-muted-foreground">Goes to <span className="text-foreground">{displayUrl(viewing.targetUrl)}</span></p>
              <DialogFooter className="sm:justify-center gap-2">
                <Button variant="outline" className="gap-2" onClick={() => copyLink(viewing)}><Copy className="w-4 h-4" /> Copy link</Button>
                <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90" asChild>
                  <a href={qrImageUrl(qrPath(viewing.code), 1200)} download={`qr-${viewing.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || viewing.code}.png`}>
                    <Download className="w-4 h-4" /> Download PNG
                  </a>
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this QR code?</AlertDialogTitle>
            <AlertDialogDescription>
              Anything already printed with it will stop working and show a "nothing here" page. If you just need it to go somewhere else, change the link instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
