// ============================================================
// QrCodesPage — dynamic QR codes (owner only)
//
// Each code is a permanent Slate link (/q/<code>). A link code forwards to
// whatever website Geoff points it at today, with an optional scheduled
// switch to a second link; a contact code hands the scanner a contact card.
// Print the QR once, re-point it forever. Lock freezes where a code goes
// (link, contact, schedule) and blocks delete until unlocked; a database
// trigger enforces that, the UI just reflects it. Scans are logged per day
// and link forwards carry analytics tags so Google Analytics reports each
// code as its own source.
//
// Design: Dark Cinematic Studio
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Lock, Unlock, Edit3, Trash2, Copy, Download, ExternalLink, ScanLine, RefreshCw, FileImage, FileText, FileCode2, Contact, Link2, CalendarClock } from "lucide-react";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { supabase } from "@/lib/supabase";
import { publicUrl } from "@/lib/publicUrl";
import { contactDisplayName, countSince, displayUrl, effectiveTarget, emptyContact, isValidCode, normalizeCode, normalizeTargetUrl, qrPath, scansPerDay, taggedTarget, toLocalInput, type QrContact } from "@/lib/qr";
import { dataUrlToBlob, downloadBlob, qrPdf, qrPngDataUrl, qrSvg, type QrBrand } from "@/lib/qrRender";
import QrImage from "@/components/QrImage";
import { toast } from "sonner";

type QrKind = "link" | "contact";

interface QrCode {
  id: string;
  code: string;
  name: string;
  kind: QrKind;
  contact: QrContact | null;
  targetUrl: string;
  nextTargetUrl: string;
  switchAt: string | null;
  locked: boolean;
  utmEnabled: boolean;
  caption: string;
  captionEnabled: boolean;
  scanCount: number;
  lastScannedAt: string | null;
  createdAt: string;
}

function rowToQrCode(r: any): QrCode {
  return {
    id: r.id,
    code: r.code || "",
    name: r.name || "",
    kind: r.kind === "contact" ? "contact" : "link",
    contact: r.contact && typeof r.contact === "object" ? { ...emptyContact, ...r.contact } : null,
    targetUrl: r.target_url || "",
    nextTargetUrl: r.next_target_url || "",
    switchAt: r.switch_at || null,
    locked: !!r.locked,
    utmEnabled: r.utm_enabled !== false,
    caption: r.caption || "",
    captionEnabled: !!r.caption_enabled,
    scanCount: Number(r.scan_count ?? 0),
    lastScannedAt: r.last_scanned_at || null,
    createdAt: r.created_at || "",
  };
}

interface FormData {
  kind: QrKind; name: string; targetUrl: string; code: string; utmEnabled: boolean;
  contact: QrContact; scheduleOn: boolean; nextTargetUrl: string; switchAt: string;
}
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

const Field = ({ id, label, value, onChange, placeholder, type = "text", disabled }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; disabled?: boolean }) => (
  <div className="space-y-1">
    <Label htmlFor={id} className="text-xs">{label}</Label>
    <Input id={id} type={type} value={value} placeholder={placeholder} disabled={disabled} onChange={e => onChange(e.target.value)} />
  </div>
);

export default function QrCodesPage() {
  const { profile } = useAuth();
  const { data } = useApp();
  const orgId = profile?.orgId || "";
  const org = data.organization;
  const brand = useMemo<QrBrand>(() => ({
    mark: org?.faviconUrl || org?.logoUrl || undefined,
    wordmark: org?.logoUrl || undefined,
    name: org?.name || "",
  }), [org?.faviconUrl, org?.logoUrl, org?.name]);

  // "Choose from Slate": the org's own public pages, so no link ever gets pasted wrong.
  const slateLinks = useMemo(() => {
    const groups: { label: string; items: { label: string; url: string }[] }[] = [];
    if (org?.slug) groups.push({ label: "Booking", items: [
      { label: "Check your date (wedding inquiry)", url: publicUrl(`/date/${org.slug}`) },
      { label: "Mini session booking page", url: publicUrl(`/book/${org.slug}`) },
    ] });
    const minis = data.miniSessions.filter(m => m.status === "published" && m.publicToken).map(m => ({ label: `${m.title}${m.date ? ` · ${m.date}` : ""}`, url: publicUrl(`/minis/${m.publicToken}`) }));
    if (minis.length) groups.push({ label: "Mini sessions", items: minis });
    const galleries = data.deliveries.filter(d => d.status !== "draft" && (d.slug || d.token)).slice(0, 25).map(d => ({ label: d.title || "Gallery", url: publicUrl(d.slug ? `/g/${d.slug}` : `/deliver/${d.token}`) }));
    if (galleries.length) groups.push({ label: "Galleries", items: galleries });
    if (org?.businessInfo?.website) groups.push({ label: "Website", items: [{ label: displayUrl(org.businessInfo.website), url: normalizeTargetUrl(org.businessInfo.website) || org.businessInfo.website }] });
    return groups;
  }, [org, data.miniSessions, data.deliveries]);

  const defaultContact = useMemo<QrContact>(() => {
    const b = org?.businessInfo;
    const [firstName = "", ...rest] = (b?.ownerName || "").trim().split(/\s+/);
    return { ...emptyContact, firstName, lastName: rest.join(" "), org: org?.name || "", phone: b?.phone || "", email: b?.email || "", website: b?.website || "", address: b?.address || "", city: b?.city || "", state: b?.state || "", zip: b?.zip || "" };
  }, [org]);

  const emptyForm = useCallback((): FormData => ({ kind: "link", name: "", targetUrl: "", code: "", utmEnabled: true, contact: defaultContact, scheduleOn: false, nextTargetUrl: "", switchAt: "" }), [defaultContact]);

  const [codes, setCodes] = useState<QrCode[]>([]);
  const [scans, setScans] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<QrCode | null>(null);
  const [form, setForm] = useState<FormData>(() => ({ kind: "link", name: "", targetUrl: "", code: "", utmEnabled: true, contact: emptyContact, scheduleOn: false, nextTargetUrl: "", switchAt: "" }));
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QrCode | null>(null);
  const [viewing, setViewing] = useState<QrCode | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [captionDraft, setCaptionDraft] = useState("");

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

  const openAdd = () => { setEditing(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (c: QrCode) => {
    setEditing(c);
    setForm({ kind: c.kind, name: c.name, targetUrl: c.targetUrl, code: c.code, utmEnabled: c.utmEnabled, contact: c.contact || defaultContact, scheduleOn: !!(c.nextTargetUrl && c.switchAt), nextTargetUrl: c.nextTargetUrl, switchAt: toLocalInput(c.switchAt) });
    setDialogOpen(true);
  };
  const openView = (c: QrCode) => { setViewing(c); setCaptionDraft(c.caption); };

  const save = async () => {
    const frozen = !!editing?.locked;
    const isContact = form.kind === "contact";
    let target = "";
    if (!isContact && !frozen) {
      const t = normalizeTargetUrl(form.targetUrl);
      if (!t) { toast.error("Enter a web address, like sdubmedia.com/weddings"); return; }
      target = t;
    }
    let next = "", switchAt: string | null = null;
    if (!isContact && !frozen && form.scheduleOn) {
      const n = normalizeTargetUrl(form.nextTargetUrl);
      if (!n) { toast.error("Enter the web address it should switch to"); return; }
      const when = new Date(form.switchAt);
      if (!form.switchAt || Number.isNaN(when.getTime())) { toast.error("Pick the date and time to switch"); return; }
      next = n; switchAt = when.toISOString();
    }
    const name = form.name.trim() || (isContact ? contactDisplayName(form.contact) : displayUrl(target || editing?.targetUrl || ""));
    const code = form.code.trim() ? normalizeCode(form.code) : (editing ? editing.code : nanoid(8));
    if (!isValidCode(code)) { toast.error("Codes are 3 to 40 letters, numbers or dashes"); return; }
    setSaving(true);
    try {
      const taken = (msg: string) => /qr_codes_code_idx|duplicate/i.test(msg) ? `The code "${code}" is already taken` : msg;
      if (editing) {
        const patch: Record<string, unknown> = { name, utm_enabled: form.utmEnabled, updated_at: new Date().toISOString() };
        if (!frozen) {
          patch.code = code;
          if (isContact) { patch.contact = form.contact; }
          else { patch.target_url = target; patch.next_target_url = next; patch.switch_at = switchAt; }
        }
        const { data: row, error } = await supabase.from("qr_codes").update(patch).eq("id", editing.id).select().single();
        if (error) throw new Error(taken(error.message));
        const updated = rowToQrCode(row);
        setCodes(cs => cs.map(c => c.id === updated.id ? updated : c));
        toast.success(frozen ? "Saved" : "Saved. The printed code now goes there.");
      } else {
        const { data: row, error } = await supabase.from("qr_codes")
          .insert({ id: nanoid(10), org_id: orgId, code, name, kind: form.kind, contact: isContact ? form.contact : null, target_url: target, next_target_url: next, switch_at: switchAt, utm_enabled: form.utmEnabled })
          .select().single();
        if (error) throw new Error(taken(error.message));
        const created = rowToQrCode(row);
        setCodes(cs => [created, ...cs]);
        openView(created);
        toast.success("QR code created");
      }
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const patchCode = async (c: QrCode, patch: Record<string, unknown>, okMessage?: string) => {
    const { data: row, error } = await supabase.from("qr_codes").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", c.id).select().single();
    if (error) { toast.error(error.message); return null; }
    const updated = rowToQrCode(row);
    setCodes(cs => cs.map(x => x.id === updated.id ? updated : x));
    setViewing(v => v && v.id === updated.id ? updated : v);
    if (okMessage) toast.success(okMessage);
    return updated;
  };

  const toggleLock = async (c: QrCode) => {
    const updated = await patchCode(c, { locked: !c.locked });
    if (updated) toast.success(updated.locked ? "Locked. Where it goes can't change until you unlock it." : "Unlocked");
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
        // Save the caption first so the sheet and the card agree.
        if (captionDraft !== c.caption) await patchCode(c, { caption: captionDraft });
        const bytes = await qrPdf(url, c.captionEnabled ? captionDraft.trim() : "", brand);
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
  const frozen = !!editing?.locked;

  const destinationLine = (c: QrCode) => {
    if (c.kind === "contact") return <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Contact className="w-3 h-3" /> Adds {contactDisplayName(c.contact)} to Contacts</span>;
    const now = effectiveTarget(c);
    return (
      <a href={now} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1 max-w-full min-w-0">
        <span className="truncate">{displayUrl(now)}</span><ExternalLink className="w-3 h-3 shrink-0" />
      </a>
    );
  };
  const scheduleLine = (c: QrCode) => {
    if (c.kind !== "link" || !c.nextTargetUrl || !c.switchAt) return null;
    const when = new Date(c.switchAt);
    const passed = when.getTime() <= Date.now();
    return (
      <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1 max-w-full min-w-0">
        <CalendarClock className="w-3 h-3 shrink-0" />
        <span className="truncate">{passed ? `Switched to ${displayUrl(c.nextTargetUrl)} on` : `Switches to ${displayUrl(c.nextTargetUrl)} on`} {when.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
      </p>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-border bg-card/50">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>QR Codes</h1>
          <p className="text-sm text-muted-foreground">Print a code once, point it anywhere, change the link whenever you like.</p>
        </div>
        <div className="flex items-center gap-4">
          {codes.length > 0 && (
            <div className="hidden sm:flex items-baseline gap-4 text-sm">
              <span><span className="text-2xl font-semibold text-foreground">{totalScans}</span> <span className="text-muted-foreground">scans</span></span>
              <span><span className="text-lg font-semibold text-foreground">{scansThisWeek}</span> <span className="text-muted-foreground">this week</span></span>
            </div>
          )}
          <Button variant="outline" size="icon" onClick={load} title="Refresh scan counts"><RefreshCw className="w-4 h-4" /></Button>
          <Button onClick={openAdd} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"><Plus className="w-4 h-4" /> New QR Code</Button>
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
                    <button onClick={() => openView(c)} className="shrink-0 rounded-md bg-white p-1" title="Open QR">
                      <QrImage url={publicUrl(qrPath(c.code))} size={88} brand={brand} title={`QR for ${c.name}`} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="font-medium text-foreground truncate">{c.name}</h3>
                        {c.locked && <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                      </div>
                      {destinationLine(c)}
                      {scheduleLine(c)}
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
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openEdit(c)} title={c.locked ? "Locked: only the name and tagging can change" : "Edit"}>
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => toggleLock(c)}>
                      {c.locked ? <><Unlock className="w-3.5 h-3.5" /> Unlock</> : <><Lock className="w-3.5 h-3.5" /> Lock</>}
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => copyLink(c)}><Copy className="w-3.5 h-3.5" /> Copy</Button>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openView(c)}><Download className="w-3.5 h-3.5" /> Get</Button>
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
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit QR code" : "New QR code"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editing && (
              <div className="grid grid-cols-2 gap-2">
                {([["link", "Website link", Link2], ["contact", "Contact card", Contact]] as const).map(([k, label, Icon]) => (
                  <button key={k} type="button" onClick={() => setForm(f => ({ ...f, kind: k }))}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${form.kind === k ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                    <Icon className="w-4 h-4" /> {label}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="qr-name">Name</Label>
              <Input id="qr-name" placeholder={form.kind === "contact" ? "Business card" : "Front window sign"} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Shows on the card here{form.kind === "link" ? " and as the campaign name in Google Analytics" : ""}.</p>
            </div>

            {form.kind === "link" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="qr-url">Sends people to</Label>
                  {slateLinks.length > 0 && !frozen && (
                    <Select onValueChange={v => setForm(f => ({ ...f, targetUrl: v }))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Choose from Slate…" /></SelectTrigger>
                      <SelectContent>
                        {slateLinks.map(g => (
                          <SelectGroup key={g.label}>
                            <SelectLabel>{g.label}</SelectLabel>
                            {g.items.map(it => <SelectItem key={it.url} value={it.url}>{it.label}</SelectItem>)}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Input id="qr-url" placeholder="sdubmedia.com/weddings" value={form.targetUrl} inputMode="url" autoCapitalize="off" disabled={frozen}
                    onChange={e => setForm(f => ({ ...f, targetUrl: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter") void save(); }} />
                  {frozen
                    ? <p className="text-xs text-amber-400">Locked. Unlock the code to change where it goes.</p>
                    : editing && <p className="text-xs text-muted-foreground">The printed code stays the same. Only where it goes changes.</p>}
                </div>

                <div className="rounded-md border border-border p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label htmlFor="qr-schedule">Switch to another link later</Label>
                      <p className="text-xs text-muted-foreground">At the date you pick, the code starts going somewhere else on its own.</p>
                    </div>
                    <Switch id="qr-schedule" checked={form.scheduleOn} disabled={frozen} onCheckedChange={v => setForm(f => ({ ...f, scheduleOn: v }))} />
                  </div>
                  {form.scheduleOn && (
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <Field id="qr-next" label="Then send people to" value={form.nextTargetUrl} placeholder="sdubmedia.com/fall-minis" disabled={frozen} onChange={v => setForm(f => ({ ...f, nextTargetUrl: v }))} />
                      <Field id="qr-when" label="Starting" type="datetime-local" value={form.switchAt} disabled={frozen} onChange={v => setForm(f => ({ ...f, switchAt: v }))} />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-md border border-border p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Scanning offers to save this to their phone's Contacts. Filled from your business info; edit anything.</p>
                {frozen && <p className="text-xs text-amber-400">Locked. Unlock the code to change the details.</p>}
                <div className="grid grid-cols-2 gap-2">
                  <Field id="c-first" label="First name" value={form.contact.firstName} disabled={frozen} onChange={v => setForm(f => ({ ...f, contact: { ...f.contact, firstName: v } }))} />
                  <Field id="c-last" label="Last name" value={form.contact.lastName} disabled={frozen} onChange={v => setForm(f => ({ ...f, contact: { ...f.contact, lastName: v } }))} />
                  <Field id="c-org" label="Company" value={form.contact.org} disabled={frozen} onChange={v => setForm(f => ({ ...f, contact: { ...f.contact, org: v } }))} />
                  <Field id="c-title" label="Title" value={form.contact.title} placeholder="Owner / Videographer" disabled={frozen} onChange={v => setForm(f => ({ ...f, contact: { ...f.contact, title: v } }))} />
                  <Field id="c-phone" label="Phone" type="tel" value={form.contact.phone} disabled={frozen} onChange={v => setForm(f => ({ ...f, contact: { ...f.contact, phone: v } }))} />
                  <Field id="c-email" label="Email" type="email" value={form.contact.email} disabled={frozen} onChange={v => setForm(f => ({ ...f, contact: { ...f.contact, email: v } }))} />
                </div>
                <Field id="c-web" label="Website" value={form.contact.website} disabled={frozen} onChange={v => setForm(f => ({ ...f, contact: { ...f.contact, website: v } }))} />
                <div className="grid grid-cols-[2fr_1fr_1fr] gap-2">
                  <Field id="c-city" label="City" value={form.contact.city} disabled={frozen} onChange={v => setForm(f => ({ ...f, contact: { ...f.contact, city: v } }))} />
                  <Field id="c-state" label="State" value={form.contact.state} disabled={frozen} onChange={v => setForm(f => ({ ...f, contact: { ...f.contact, state: v } }))} />
                  <Field id="c-zip" label="Zip" value={form.contact.zip} disabled={frozen} onChange={v => setForm(f => ({ ...f, contact: { ...f.contact, zip: v } }))} />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="qr-code">Code</Label>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground font-mono shrink-0">/q/</span>
                <Input id="qr-code" placeholder={editing ? editing.code : "leave blank for a random one"} value={form.code} autoCapitalize="off" disabled={frozen}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))} className="font-mono" />
              </div>
              {editing && !frozen && form.code.trim() && normalizeCode(form.code) !== editing.code && (
                <p className="text-xs text-amber-400">Changing the code breaks anything already printed with the old one.</p>
              )}
              {!editing && <p className="text-xs text-muted-foreground">Optional. A word like <span className="font-mono">weddings</span> makes a link you can also type or text.</p>}
            </div>

            {form.kind === "link" && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                <div>
                  <Label htmlFor="qr-utm">Tag for Google Analytics</Label>
                  <p className="text-xs text-muted-foreground">Scans show up as their own source in Analytics. Turn off for links that can't take extra parameters.</p>
                </div>
                <Switch id="qr-utm" checked={form.utmEnabled} onCheckedChange={v => setForm(f => ({ ...f, utmEnabled: v }))} />
              </div>
            )}
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
                {viewing.kind === "contact"
                  ? <>Adds <span className="text-foreground">{contactDisplayName(viewing.contact)}</span> to Contacts</>
                  : <>Goes to <span className="text-foreground">{displayUrl(taggedTarget(effectiveTarget(viewing), viewing.name, viewing.code, viewing.utmEnabled))}</span></>}
              </p>
              <div className="rounded-md border border-border p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="qr-caption">Caption on the PDF sheet</Label>
                  <Switch id="qr-caption" checked={viewing.captionEnabled} onCheckedChange={v => { void patchCode(viewing, { caption_enabled: v, caption: captionDraft }); }} />
                </div>
                {viewing.captionEnabled && (
                  <Input id="qr-caption" placeholder={viewing.kind === "contact" ? "Scan to save my contact" : "Scan to book"} value={captionDraft}
                    onChange={e => setCaptionDraft(e.target.value)}
                    onBlur={() => { if (captionDraft !== viewing.caption) void patchCode(viewing, { caption: captionDraft }); }} />
                )}
              </div>
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
