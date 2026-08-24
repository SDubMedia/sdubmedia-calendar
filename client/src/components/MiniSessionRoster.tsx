// ============================================================
// MiniSessionRoster — everything the owner does with one mini-session event:
// publish it, hand out its QR, work the roster on shoot day, and afterwards
// drop the whole card in to be split into per-family galleries.
// ============================================================

import { useMemo, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Download, QrCode, Upload, Ban, UserX, ExternalLink, Check, AlertTriangle, Images } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { generateSlots, formatSlot } from "@/lib/miniSlots";
import { captureTimeOf } from "@/lib/captureTime";
import { scanFileForToken } from "@/lib/qrScan";
import { groupPhotos, reassignPhotos, type PhotoGroup, type ScannedPhoto } from "@/lib/miniGrouping";
import { toUploadableImage } from "@/lib/heic";
import { getAuthToken } from "@/lib/supabase";
import type { MiniSession, MiniSessionBooking } from "@/lib/types";

const money = (cents: number) => `$${(Math.round(cents) / 100).toFixed(2).replace(/\.00$/, "")}`;

export default function MiniSessionRoster({ event, open, onClose }: { event: MiniSession; open: boolean; onClose: () => void }) {
  const { data, updateMiniSession, updateMiniBooking, addDelivery, updateDelivery, registerDeliveryFile } = useApp();
  const [qrFor, setQrFor] = useState<MiniSessionBooking | null>(null);
  const [showEventQr, setShowEventQr] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Sorting pipeline state
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [groups, setGroups] = useState<PhotoGroup[] | null>(null);
  const [qrIds, setQrIds] = useState<string[]>([]);
  const [delivering, setDelivering] = useState(false);

  const slots = useMemo(() => generateSlots(event), [event]);
  const bookings = useMemo(
    () => data.miniSessionBookings.filter(b => b.miniSessionId === event.id),
    [data.miniSessionBookings, event.id],
  );
  const bySlot = useMemo(() => {
    const m = new Map<string, MiniSessionBooking>();
    for (const b of bookings) if (b.status === "booked" || b.status === "no_show") m.set(b.slotTime, b);
    return m;
  }, [bookings]);

  const signupUrl = `${window.location.origin}/minis/${event.publicToken}`;
  const bookedCount = bookings.filter(b => b.status === "booked").length;
  const owedCount = bookings.filter(b => b.status === "booked" && b.paymentStatus === "balance_failed").length;

  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.success(`${what} copied`)).catch(() => toast.error("Couldn't copy"));
  };

  async function toggleBlock(time: string) {
    const blocked = event.blockedSlots.includes(time);
    try {
      await updateMiniSession(event.id, {
        blockedSlots: blocked ? event.blockedSlots.filter(t => t !== time) : [...event.blockedSlots, time],
      });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update"); }
  }

  async function setStatus(status: MiniSession["status"]) {
    try {
      await updateMiniSession(event.id, { status });
      toast.success(status === "published" ? "Live — the link is open for bookings" : status === "closed" ? "Closed to new bookings" : "Updated");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update"); }
  }

  // ---------- shoot-day photo sorting ----------

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const files = Array.from(list).filter(f => f.type.startsWith("image/") || /\.(cr2|cr3|nef|arw|dng|raf|orf|rw2)$/i.test(f.name));
    if (files.length === 0) { toast.error("Those weren't photos"); return; }

    setScanning(true);
    setGroups(null);
    try {
      const scanned: ScannedPhoto[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setScanMsg(`Reading ${i + 1} of ${files.length}…`);
        // Capture time MUST come off the original file — the upload path
        // re-encodes through a canvas and drops EXIF entirely.
        const { ms, fromExif } = await captureTimeOf(f);
        const qrToken = await scanFileForToken(f);
        scanned.push({ id: String(i), name: f.name, ms, fromExif, qrToken });
      }
      const bookable = bookings
        .filter(b => b.status === "booked" || b.status === "no_show")
        .map(b => ({ id: b.id, bookingToken: b.bookingToken, name: b.name, slotTime: b.slotTime }));
      const result = groupPhotos(scanned, bookable, event);
      setPendingFiles(files);
      setQrIds(result.qrPhotoIds);
      setGroups(result.groups);
      if (result.unknownTokens.length > 0) {
        toast.warning(`${result.unknownTokens.length} code${result.unknownTokens.length === 1 ? "" : "s"} didn't match this event — those photos are in Unassigned.`);
      }
      const noExif = scanned.filter(s => !s.fromExif).length;
      if (noExif > 0) toast.warning(`${noExif} photo${noExif === 1 ? " has" : "s have"} no capture time — check the order in review.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read those photos");
    } finally {
      setScanning(false);
      setScanMsg("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  /** Confirm the review screen: one gallery per party, photos uploaded into it. */
  async function deliverGroups() {
    if (!groups) return;
    const real = groups.filter(g => g.bookingId && g.photoIds.length > 0);
    if (real.length === 0) { toast.error("Nothing to deliver"); return; }
    setDelivering(true);
    try {
      for (const g of real) {
        const booking = bookings.find(b => b.id === g.bookingId);
        if (!booking) continue;
        setScanMsg(`Building ${booking.name}'s gallery…`);

        // Galleries can exist without a project or client record — minis are
        // strangers, so name + email on the delivery is the whole identity.
        let deliveryId = booking.deliveryId;
        if (!deliveryId) {
          const created = await addDelivery({
            projectId: null,
            title: `${event.title} — ${booking.name}`,
            coverFileId: null, coverLayout: "center", coverFont: "", coverSubtitle: "", coverDate: event.date,
            expiresAt: null,
            selectionLimit: event.includedPhotos,
            selectionMinimum: 0,
            downloadOnly: false, viewOnly: false, keepOriginals: false,
            perExtraPhotoCents: event.perExtraPhotoCents,
            buyAllFlatCents: null,
            status: "draft",
          } as never);
          deliveryId = created.id;
          await updateMiniBooking(booking.id, { deliveryId });
        }

        let position = 0;
        for (const photoId of g.photoIds) {
          const file = pendingFiles[Number(photoId)];
          if (!file) continue;
          const uploadable = await toUploadableImage(file);
          const token = await getAuthToken();
          const presign = await fetch("/api/delivery-upload", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ deliveryId, fileName: uploadable.name, contentType: uploadable.type, sizeBytes: uploadable.size }),
          });
          const info = await presign.json();
          if (!presign.ok) throw new Error(info.error || "Upload failed");
          const put = await fetch(info.uploadUrl, { method: "PUT", body: uploadable, headers: { "Content-Type": uploadable.type } });
          if (!put.ok) throw new Error("Upload failed");
          await registerDeliveryFile({
            deliveryId,
            storagePath: info.storagePath,
            originalName: uploadable.name,
            sizeBytes: uploadable.size,
            width: null, height: null,
            mimeType: uploadable.type,
            mediaType: "image",
            position: position++,
          } as never);
        }
        await updateDelivery(deliveryId, { status: "sent" });
      }
      toast.success(`${real.length} galler${real.length === 1 ? "y" : "ies"} built — send them from Galleries.`);
      setGroups(null); setPendingFiles([]); setQrIds([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't build the galleries");
    } finally {
      setDelivering(false);
      setScanMsg("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-card border-border text-foreground max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{event.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Share + status */}
          <div className="rounded-lg border border-border bg-secondary/40 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground">
                {new Date(event.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                {event.locationText ? ` · ${event.locationText}` : ""}
              </p>
              <div className="flex gap-1.5">
                {event.status !== "published" && <Button size="sm" onClick={() => setStatus("published")}>Publish</Button>}
                {event.status === "published" && <Button size="sm" variant="outline" onClick={() => setStatus("closed")}>Close bookings</Button>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowEventQr(true)}><QrCode className="w-3.5 h-3.5" /> Event QR</Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => copy(signupUrl, "Sign-up link")}><Copy className="w-3.5 h-3.5" /> Copy link</Button>
              <a href={signupUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
                <ExternalLink className="w-3 h-3" /> Preview
              </a>
            </div>
            {event.status === "draft" && (
              <p className="text-[11px] text-amber-400">Still a draft — publish before you hand the QR out, or the link shows nothing.</p>
            )}
            <p className="text-xs text-muted-foreground">
              {bookedCount} of {slots.length} booked
              {owedCount > 0 && <span className="text-red-400"> · {owedCount} card issue{owedCount === 1 ? "" : "s"}</span>}
            </p>
          </div>

          {/* Roster */}
          {!groups && (
            <div className="space-y-1.5">
              {slots.map(time => {
                const b = bySlot.get(time);
                const blocked = event.blockedSlots.includes(time);
                return (
                  <div key={time} className={cn("flex items-center gap-2 rounded-md border p-2.5",
                    b ? "border-border bg-secondary/30" : blocked ? "border-border bg-secondary/10 opacity-60" : "border-dashed border-border")}>
                    <span className="text-sm font-mono text-muted-foreground w-20 shrink-0">{formatSlot(time)}</span>
                    <div className="min-w-0 flex-1">
                      {b ? (
                        <>
                          <p className={cn("text-sm truncate", b.status === "no_show" ? "text-muted-foreground line-through" : "text-foreground")}>{b.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {b.email}
                            {b.paymentStatus === "paid" ? " · paid" : b.paymentStatus === "deposit_paid" ? ` · ${money(b.depositPaidCents)} paid, ${money(b.totalCents - b.depositPaidCents)} due` : ""}
                            {b.paymentStatus === "balance_failed" ? " · card declined" : ""}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">{blocked ? "Blocked" : "Open"}</p>
                      )}
                    </div>
                    {b ? (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => setQrFor(b)} title="Show their code" className="p-1.5 rounded text-primary hover:bg-primary/10"><QrCode className="w-4 h-4" /></button>
                        <button onClick={() => updateMiniBooking(b.id, { status: b.status === "no_show" ? "booked" : "no_show" })}
                          title={b.status === "no_show" ? "Undo no-show" : "Mark no-show"}
                          className="p-1.5 rounded text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10"><UserX className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <button onClick={() => toggleBlock(time)} title={blocked ? "Reopen slot" : "Block slot"}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 shrink-0"><Ban className="w-4 h-4" /></button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Photo sorting */}
          {!groups ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-center">
              <input ref={fileInput} type="file" accept="image/*,.cr2,.cr3,.nef,.arw,.dng,.raf,.orf,.rw2" multiple className="hidden"
                onChange={e => handleFiles(e.target.files)} />
              <Images className="w-6 h-6 mx-auto mb-2 text-muted-foreground opacity-60" />
              <p className="text-sm text-foreground font-medium mb-1">Drop the whole card in</p>
              <p className="text-xs text-muted-foreground mb-3">
                Slate reads each QR frame and splits the photos into per-family galleries. You review before anything is built.
              </p>
              <Button size="sm" onClick={() => fileInput.current?.click()} disabled={scanning} className="gap-1.5">
                <Upload className="w-3.5 h-3.5" /> {scanning ? (scanMsg || "Reading…") : "Choose photos"}
              </Button>
            </div>
          ) : (
            <ReviewPanel
              groups={groups}
              qrCount={qrIds.length}
              files={pendingFiles}
              busy={delivering}
              busyMsg={scanMsg}
              onReassign={(ids, to) => setGroups(g => g ? reassignPhotos(g, ids, to) : g)}
              onCancel={() => { setGroups(null); setPendingFiles([]); setQrIds([]); }}
              onConfirm={deliverGroups}
            />
          )}
        </div>

        {/* Booking QR — the forgotten-phone fallback: show it off HIS screen. */}
        <Dialog open={!!qrFor} onOpenChange={(o) => { if (!o) setQrFor(null); }}>
          <DialogContent className="bg-card border-border text-foreground max-w-xs">
            <DialogHeader><DialogTitle className="text-base">{qrFor?.name}</DialogTitle></DialogHeader>
            {qrFor && (
              <div className="text-center pb-2">
                <img src={`/api/qr?d=${encodeURIComponent(`${window.location.origin}/msb/${qrFor.bookingToken}`)}&s=420`}
                  alt="Check-in code" className="w-56 h-56 mx-auto rounded-lg bg-white p-2" />
                <p className="text-xs text-muted-foreground mt-2">{formatSlot(qrFor.slotTime)} · photograph this before their session</p>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Event QR for flyers */}
        <Dialog open={showEventQr} onOpenChange={setShowEventQr}>
          <DialogContent className="bg-card border-border text-foreground max-w-xs">
            <DialogHeader><DialogTitle className="text-base">Sign-up code</DialogTitle></DialogHeader>
            <div className="text-center pb-2">
              <img src={`/api/qr?d=${encodeURIComponent(signupUrl)}&s=600`} alt="Sign-up QR" className="w-60 h-60 mx-auto rounded-lg bg-white p-2" />
              <p className="text-xs text-muted-foreground mt-2 break-all">{signupUrl}</p>
              <a href={`/api/qr?d=${encodeURIComponent(signupUrl)}&s=1200`} download={`${event.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-qr.png`}
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80">
                <Download className="w-3.5 h-3.5" /> Download for print
              </a>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

/** The gate before anything is built or sent: what Slate thinks belongs to whom. */
function ReviewPanel({ groups, qrCount, files, busy, busyMsg, onReassign, onCancel, onConfirm }: {
  groups: PhotoGroup[];
  qrCount: number;
  files: File[];
  busy: boolean;
  busyMsg: string;
  onReassign: (photoIds: string[], toBookingId: string | null) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const named = groups.filter(g => g.bookingId);
  const unassigned = groups.find(g => !g.bookingId);
  const total = groups.reduce((n, g) => n + g.photoIds.length, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-foreground">Check the groups</p>
          <p className="text-xs text-muted-foreground">
            {total} photo{total === 1 ? "" : "s"} across {named.length} famil{named.length === 1 ? "y" : "ies"}
            {qrCount > 0 ? ` · ${qrCount} code frame${qrCount === 1 ? "" : "s"} excluded` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Start over</Button>
          <Button size="sm" onClick={onConfirm} disabled={busy || named.length === 0} className="gap-1.5">
            <Check className="w-3.5 h-3.5" /> {busy ? (busyMsg || "Building…") : "Build galleries"}
          </Button>
        </div>
      </div>

      {named.map(g => (
        <div key={g.bookingId} className="rounded-lg border border-border bg-secondary/30 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{g.bookingName}</p>
              <p className="text-[11px] text-muted-foreground">
                {formatSlot(g.slotTime)} · {g.photoIds.length} photo{g.photoIds.length === 1 ? "" : "s"}
                {g.via === "slot-time" && <span className="text-amber-400"> · matched by time (no code found)</span>}
              </p>
            </div>
          </div>
          <Thumbs ids={g.photoIds} files={files} />
        </div>
      ))}

      {unassigned && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-sm font-medium text-amber-300 flex items-center gap-1.5 mb-1">
            <AlertTriangle className="w-4 h-4" /> Unassigned · {unassigned.photoIds.length}
          </p>
          <p className="text-[11px] text-muted-foreground mb-2">
            No code before these and no session running at that time. Pick who they belong to, or leave them out.
          </p>
          <Thumbs ids={unassigned.photoIds} files={files} />
          {named.length > 0 && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-muted-foreground">Move all to:</span>
              {named.map(g => (
                <button key={g.bookingId} onClick={() => onReassign(unassigned.photoIds, g.bookingId)}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-white/5">
                  {g.bookingName}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Thumbs({ ids, files }: { ids: string[]; files: File[] }) {
  const shown = ids.slice(0, 8);
  return (
    <div className="flex gap-1.5 flex-wrap">
      {shown.map(id => {
        const f = files[Number(id)];
        if (!f) return null;
        return <img key={id} src={URL.createObjectURL(f)} alt="" className="w-12 h-12 rounded object-cover border border-border" />;
      })}
      {ids.length > shown.length && (
        <div className="w-12 h-12 rounded border border-border flex items-center justify-center text-[11px] text-muted-foreground">
          +{ids.length - shown.length}
        </div>
      )}
    </div>
  );
}
