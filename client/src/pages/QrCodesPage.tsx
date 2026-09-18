// ============================================================
// QrCodesPage — dynamic QR codes (owner only)
//
// Each code is a permanent Slate link (/q/<code>) that forwards to whatever
// website Geoff points it at today. Print the QR once, re-point it forever.
// Lock freezes a code: no link edits, no delete, until it's unlocked. The
// lock is also enforced by a database trigger, so the UI is a convenience,
// not the guard. Scans are logged per day; the forward carries analytics
// tags so Google Analytics reports each code as its own source.
//
// Design: Dark Cinematic Studio
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Lock, Unlock, Edit3, Trash2, Copy, Download, ExternalLink, ScanLine, RefreshCw, FileImage, FileText, FileCode2 } from "lucide-react";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { supabase } from "@/lib/supabase";
import { publicUrl } from "@/lib/publicUrl";
import { countSince, displayUrl, isValidCode, normalizeCode, normalizeTargetUrl, qrPath, scansPerDay, taggedTarget } from "@/lib/qr";
import { dataUrlToBlob, downloadBlob, qrPdf, qrPngDataUrl, qrSvg, type QrBrand } from "@/lib/qrRender";
import QrImage from "@/components/QrImage";
import { toast } from "sonner";

interface QrCode {
  id: string;
  code: string;
  name: string;
  targetUrl: string;
  locked: boolean;
  utmEnabled: boolean;
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
    utmEnabled: r.utm_enabled !== false,
    scanCount: Number(r.scan_count ?? 0),
    lastScannedAt: r.last_scanned_at || null,
    createdAt: r.created_at || "",
  };
}

interface FormData { name: string; targetUrl: string; code: string; utmEnabled: boolean }
const emptyForm: FormData = { name: "", targetUrl: "", code: "", utmEnabled: true };
const HISTORY_DAYS = 30;
const CHART_DAYS = 14;

function fileStem(c: QrCode): string {
  return `qr-${c.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || c.code}`;
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-[3px] h-8" title={`Scans per day, last ${values.length} days`}>
      {values.map((v, i) => (
        <div key={i} className={`flex-1 rounded-sm ${v ? "bg-primary" : "bg-border"}`}
          style={{ height: `${v ? Math.max(12, (v / max) * 100) : 8}%` }} title={`${v} scan${v === 1 ? "" : "s"}`} />
      ))}
    </div>
  );
}

export default function QrCodesPage() {
  const { profile } = useAuth();
  const { data } = useApp();
  const orgId = profile?.orgId || "";
  const brand = useMemo<QrBrand>(() => ({
    mark: data.organization?.faviconUrl || data.organization?.logoUrl || undefined,
    wordmark: data.organization?.logoUrl || undefined,
    name: data.organization?.name || "",
  }), [data.organization?.faviconUrl, data.organization?.logoUrl, data.organization?.name]);

  const [codes, setCodes] = useState<QrCode[]>([]);
  const [scans, setScans] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<QrCode | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QrCode | null>(null);
  const [viewing, setViewing] = useState<QrCode | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString();
    const [{ data: rows, error }, { data: scanRows, error: scanErr }] = await Promise.all([
      supabase.from("qr_codes").select("*").order("created_at", { ascending: false }),
      supabase.from("qr_scans").select("qr_code_id, scanned_at").gte("scanned_at", since),
    ]);
    if (error) { toast.error(`Couldn't load QR codes: ${error.message}`); return; }
    if (scanErr) console.error("[qr] scan history", scanErr.message);
    setCodes((rows || []).map(rowToQrCode));
    const byCode: Record<string, string[]> = {};
    for (const s of scanRows || []) (byCode[s.qr_code_id] ||= []).push(s.scanned_at);
    setScans(byCode);
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
  const openEdit = (c: QrCode) => { setEditing(c); setForm({ name: c.name, targetUrl: c.targetUrl, code: c.code, utmEnabled: c.utmEnabled }); setDialogOpen(true); };

  const save = async () => {
    const target = normalizeTargetUrl(form.targetUrl);
    if (!target) { toast.error("Enter a web address, like sdubmedia.com/weddings"); return; }
    const name = form.name.trim() || displayUrl(target);
    const code = form.code.trim() ? normalizeCode(form.code) : (editing ? editing.code : nanoid(8));
    if (!isValidCode(code)) { toast.error("Codes are 3 to 40 letters, numbers or dashes"); return; }
    setSaving(true);
    try {
      if (editing) {
        const patch: Record<string, unknown> = { name, utm_enabled: form.utmEnabled, updated_at: new Date().toISOString() };
        if (!editing.locked) { patch.target_url = target; patch.code = code; }
        const { data: row, error } = await supabase.from("qr_codes").update(patch).eq("id", editing.id).select().single();
        if (error) throw new Error(/qr_codes_code_idx|duplicate/i.test(error.message) ? `The code "${code}" is already taken` : error.message);
        const updated = rowToQrCode(row);
        setCodes(cs => cs.map(c => c.id === updated.id ? updated : c));
        toast.success(editing.locked ? "Saved" : "Saved. The printed code now goes there.");
      } else {
        const { data: row, error } = await supabase.from("qr_codes")
          .insert({ id: nanoid(10), org_id: orgId, code, name, target_url: target, utm_enabled: form.utmEnabled })
          .select().single();
        if (error) throw new Error(/qr_codes_code_idx|duplicate/i.test(error.message) ? `The code "${code}" is already taken` : error.message);
        const created = rowToQrCode(row);
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
    const { data: row, error } = await supabase.from("qr_codes")
      .update({ locked: !c.locked, updated_at: new Date().toISOString() })
      .eq("id", c.id).select().single();
    if (error) { toast.error(error.message); return; }
    const updated = rowToQrCode(row);
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

  const exportCode = async (c: QrCode, kind: "png" | "print" | "svg" | "pdf") => {
    const url = publicUrl(qrPath(c.code));
    setExporting(`${c.id}:${kind}`);
    try {
      if (kind === "png" || kind === "print") {
        const dataUrl = await qrPngDataUrl(url, kind === "png" ? 1200 : 3000, brand);
        downloadBlob(`${fileStem(c)}${kind === "print" ? "-print" : ""}.png`, dataUrlToBlob(dataUrl));
      } else if (kind === "svg") {
        const svg = await qrSvg(url, brand);
        downloadBlob(`${fileStem(c)}.svg`, new Blob([svg], { type: "image/svg+xml" }));
      } else {
        const bytes = await qrPdf(url, c.name, brand);
        downloadBlob(`${fileStem(c)}.pdf`, new Blob([bytes as BlobPart], { type: "application/pdf" }));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't export");
    } finally {
      setExporting(null);
    }
  };

  const totalScans = useMemo(() => codes.reduce((n, c) => n + c.scanCount, 0), [codes]);
  const scansThisWeek = useMemo(() => Object.values(scans).reduce((n, list) => n + countSince(list, 7), 0), [scans]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-border bg-card/50">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>QR Codes</h1>
          <p className="text-sm text-muted-foreground">
            Print a code once, point it anywhere, change the link whenever you like.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {codes.length > 0 && (
            <div className="hidden sm:flex items-baseline gap-4 text-sm">
              <span><span className="text-2xl font-semibold text-foreground">{totalScans}</span> <span className="text-muted-foreground">scans</span></span>
              <span><span className="text-lg font-semibold text-foreground">{scansThisWeek}</span> <span className="text-muted-foreground">this week</span></span>
            </div>
          )}
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
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
            {codes.map(c => {
              const history = scans[c.id] || [];
              return (
                <div key={c.id} className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3 min-w-0">
                  <div className="flex items-start gap-3 min-w-0">
                    <button onClick={() => setViewing(c)} className="shrink-0 rounded-md bg-white p-1" title="Open QR">
                      <QrImage url={publicUrl(qrPath(c.code))} size={88} brand={brand} title={`QR for ${c.name}`} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="font-medium text-foreground truncate">{c.name}</h3>
                        {c.locked && <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                      </div>
                      <a href={c.targetUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1 max-w-full min-w-0">
                        <span className="truncate">{displayUrl(c.targetUrl)}</span><ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                      <p className="text-[11px] text-muted-foreground/70 font-mono truncate">/q/{c.code}</p>
                      <div className="flex items-baseline gap-2 mt-1.5">
                        <span className="text-3xl font-semibold text-foreground leading-none">{c.scanCount}</span>
                        <span className="text-xs text-muted-foreground">scans</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {countSince(history, 1)} today · {countSince(history, 7)} this week · {countSince(history, 30)} this month
                      </p>
                    </div>
                  </div>
                  <Sparkline values={scansPerDay(history, CHART_DAYS)} />
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openEdit(c)} title={c.locked ? "Locked: only the name and tagging can change" : "Change the link"}>
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => toggleLock(c)}>
                      {c.locked ? <><Unlock className="w-3.5 h-3.5" /> Unlock</> : <><Lock className="w-3.5 h-3.5" /> Lock</>}
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => copyLink(c)}>
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setViewing(c)}>
                      <Download className="w-3.5 h-3.5" /> Get
                    </Button>
                    <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive ml-auto" onClick={() => setDeleteTarget(c)} disabled={c.locked} title={c.locked ? "Unlock to delete" : "Delete"}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit QR code" : "New QR code"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="qr-name">Name</Label>
              <Input id="qr-name" placeholder="Front window sign" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Shows on the card here and as the campaign name in Google Analytics.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qr-url">Sends people to</Label>
              <Input id="qr-url" placeholder="sdubmedia.com/weddings" value={form.targetUrl} inputMode="url" autoCapitalize="off" disabled={!!editing?.locked}
                onChange={e => setForm(f => ({ ...f, targetUrl: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") void save(); }} />
              {editing?.locked
                ? <p className="text-xs text-amber-400">Locked. Unlock the code to change where it goes.</p>
                : editing && <p className="text-xs text-muted-foreground">The printed code stays the same. Only where it goes changes.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qr-code">Code</Label>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground font-mono shrink-0">/q/</span>
                <Input id="qr-code" placeholder={editing ? editing.code : "leave blank for a random one"} value={form.code} autoCapitalize="off" disabled={!!editing?.locked}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))} className="font-mono" />
              </div>
              {editing && !editing.locked && form.code.trim() && normalizeCode(form.code) !== editing.code && (
                <p className="text-xs text-amber-400">Changing the code breaks anything already printed with the old one.</p>
              )}
              {!editing && <p className="text-xs text-muted-foreground">Optional. A word like <span className="font-mono">weddings</span> makes a link you can also type or text.</p>}
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
              <div>
                <Label htmlFor="qr-utm">Tag for Google Analytics</Label>
                <p className="text-xs text-muted-foreground">Scans show up as their own source in Analytics. Turn off for links that can't take extra parameters.</p>
              </div>
              <Switch id="qr-utm" checked={form.utmEnabled} onCheckedChange={v => setForm(f => ({ ...f, utmEnabled: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {saving ? "Saving…" : editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Big QR + downloads */}
      <Dialog open={!!viewing} onOpenChange={o => { if (!o) setViewing(null); }}>
        <DialogContent className="sm:max-w-sm">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="truncate">{viewing.name}</DialogTitle>
              </DialogHeader>
              <div className="mx-auto rounded-lg bg-white p-2">
                <QrImage url={publicUrl(qrPath(viewing.code))} size={240} brand={brand} title={`QR for ${viewing.name}`} />
              </div>
              <p className="text-xs text-center text-muted-foreground break-all">{publicUrl(qrPath(viewing.code))}</p>
              <p className="text-xs text-center text-muted-foreground break-all">
                Goes to <span className="text-foreground">{displayUrl(taggedTarget(viewing.targetUrl, viewing.name, viewing.code, viewing.utmEnabled))}</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="gap-2" disabled={!!exporting} onClick={() => exportCode(viewing, "png")}><FileImage className="w-4 h-4" /> PNG</Button>
                <Button variant="outline" className="gap-2" disabled={!!exporting} onClick={() => exportCode(viewing, "print")}><FileImage className="w-4 h-4" /> PNG, print size</Button>
                <Button variant="outline" className="gap-2" disabled={!!exporting} onClick={() => exportCode(viewing, "svg")}><FileCode2 className="w-4 h-4" /> SVG (vector)</Button>
                <Button variant="outline" className="gap-2" disabled={!!exporting} onClick={() => exportCode(viewing, "pdf")}><FileText className="w-4 h-4" /> PDF sheet</Button>
              </div>
              <DialogFooter className="sm:justify-center">
                <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => copyLink(viewing)}><Copy className="w-4 h-4" /> Copy link</Button>
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
