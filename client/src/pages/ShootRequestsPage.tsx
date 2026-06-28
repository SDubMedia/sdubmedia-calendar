// ============================================================
// ShootRequestsPage — owner queue of agent-submitted shoot requests.
// Approve turns a request into a real project (one-time address location,
// service bundle with cost re-resolved for margin, billed up to the broker),
// then marks the request scheduled. Decline closes it with an optional note.
// Owner-only.
// ============================================================

import { useMemo, useState } from "react";
import { Inbox, MapPin, Clock, User, Check, X, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { onsiteMinutesForSelections, shootOnsiteMinFor } from "@/lib/data";
import type { ShootRequest, Project, ProjectServiceSelection } from "@/lib/types";
import { toast } from "sonner";

// Clear the bell notification tied to this request (link ?req=<id>) so handling
// it auto-dismisses without the owner clicking the bell.
async function clearRequestNotification(userId: string | undefined, requestId: string) {
  if (!userId) return;
  try { await supabase.from("notifications").update({ read: true }).eq("user_id", userId).like("link", `%req=${requestId}%`); }
  catch { /* best-effort — the bell will catch up on next load */ }
}

function fmtDate(iso: string): string {
  if (!iso) return "Any date";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function fmtTime(t: string | null): string {
  if (!t) return "";
  const [hs, m] = t.split(":");
  const h = Number(hs); if (Number.isNaN(h)) return t;
  const ampm = h >= 12 ? "PM" : "AM"; const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${ampm}`;
}
// Add minutes to "HH:MM", clamped to the same day (23:59 max).
function addMinutes(t: string, mins: number): string {
  const [h, m] = (t || "0:0").split(":").map(Number);
  const total = Math.min(h * 60 + m + mins, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export default function ShootRequestsPage() {
  const { data, addLocation, addProject, updateShootRequest, createReShootGallery } = useApp();
  const { profile } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<ShootRequest | null>(null);
  const [declineNote, setDeclineNote] = useState("");

  const pending = useMemo(
    () => data.shootRequests.filter(r => r.status === "pending"),
    [data.shootRequests]
  );

  const clientName = (id: string) => data.clients.find(c => c.id === id)?.company ?? "Agent";
  const brokerOf = (id: string) => {
    const agent = data.clients.find(c => c.id === id);
    if (!agent?.brokerId) return null;
    return data.clients.find(c => c.id === agent.brokerId)?.company ?? null;
  };
  const crewName = (id: string | null) => (id ? data.crewMembers.find(c => c.id === id)?.name ?? null : null);

  const handleApprove = async (req: ShootRequest) => {
    setBusyId(req.id);
    try {
      // 1. Turn the typed address into a one-time location (each house is unique).
      const addr = req.propertyAddress.trim();
      const loc = await addLocation({ name: addr, address: addr, city: "", state: "", zip: "", oneTimeUse: true });

      // 2. Re-resolve each piece's COST from the current catalog so per-house
      //    margin is correct (the agent never sent cost — they don't see it).
      const services: ProjectServiceSelection[] = req.requestedServices.map(s => {
        const variant = s.variantId ? data.serviceVariants.find(v => v.id === s.variantId) : null;
        const svc = data.services.find(x => x.id === s.serviceId);
        const cost = variant ? (variant.cost ?? 0) : (svc?.defaultCost ?? 0);
        return { ...s, cost };
      });

      // 3. Category + project type (label) from the first piece / RE type.
      const firstSvc = data.services.find(x => x.id === req.requestedServices[0]?.serviceId);
      const serviceCategoryId = firstSvc?.categoryId ?? null;
      const reType = data.projectTypes.find(t => /real\s*estate/i.test(t.name)) ?? data.projectTypes[0];

      const crew = req.preferredCrewMemberId
        ? [{ crewMemberId: req.preferredCrewMemberId, role: "Photographer", hoursWorked: 0, payRatePerHour: 0 }]
        : [];

      // On-site appointment length = sum of the requested pieces' durations
      // (falls back to the shooter's flat shoot length). Travel buffer is held
      // separately by the slot engine, not added to the visible window. The
      // request only carries a start time; without this the shoot was 9:00–9:00.
      const onsiteMin = onsiteMinutesForSelections(req.requestedServices, shootOnsiteMinFor(req.preferredCrewMemberId, data.shooterPrefs));
      const startTime = req.preferredTime ?? "";
      const endTime = startTime ? addMinutes(startTime, onsiteMin) : "";

      const payload: Omit<Project, "id" | "createdAt"> = {
        clientId: req.clientId,
        projectTypeId: reType?.id ?? "",
        locationId: loc.id,
        date: req.preferredDate ?? "",
        startTime,
        endTime,
        status: "upcoming",
        crew,
        postProduction: [],
        editorBilling: null,
        projectRate: null,
        billingModel: null,
        billingRate: null,
        editTypes: [],
        notes: [req.isVacant ? "Property is vacant." : "Property is occupied.", req.agentWillMeet ? "Agent will meet on-site." : "", req.notes].filter(Boolean).join(" "),
        deliverableUrl: "",
        cancellationReason: "",
        cancelledAt: null,
        discountType: null,
        discountAmount: 0,
        discountReason: "",
        serviceCategoryId,
        services,
        billToId: null,   // null → bills up to the agent's broker automatically
        products: [],
      };
      const project = await addProject(payload);
      // Auto-create the delivery gallery so the owner can upload + deliver. Don't
      // swallow failures — the shoot is still scheduled, but tell the owner the
      // gallery needs creating manually rather than hiding it.
      try {
        await createReShootGallery(project.id, req.propertyAddress.trim());
      } catch (gErr) {
        console.error("createReShootGallery failed on approve:", gErr);
        toast.warning("Shoot scheduled, but the photo gallery didn't auto-create — make one from the project.");
      }
      await updateShootRequest(req.id, { status: "scheduled", projectId: project.id });
      await clearRequestNotification(profile?.id, req.id);
      toast.success("Shoot scheduled — it's on your calendar");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't approve the request");
    } finally {
      setBusyId(null);
    }
  };

  const handleDecline = async () => {
    if (!declineTarget) return;
    setBusyId(declineTarget.id);
    try {
      await updateShootRequest(declineTarget.id, { status: "declined", ownerResponse: declineNote.trim() });
      await clearRequestNotification(profile?.id, declineTarget.id);
      toast.success("Request declined");
      setDeclineTarget(null);
      setDeclineNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't decline");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Shoot Requests</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{pending.length} waiting on you</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 max-w-2xl w-full mx-auto">
        {pending.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Inbox className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">No pending requests. You're all caught up.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(req => {
              const broker = brokerOf(req.clientId);
              const shooter = crewName(req.preferredCrewMemberId);
              const total = req.requestedServices.reduce((s, x) => s + Number(x.price || 0), 0);
              return (
                <div key={req.id} className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />{clientName(req.clientId)}{broker && <span className="text-xs text-muted-foreground">· {broker}</span>}</div>
                      <div className="text-sm text-foreground mt-1 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />{req.propertyAddress}</div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5"><Clock className="w-3 h-3 flex-shrink-0" />{fmtDate(req.preferredDate ?? "")}{req.preferredTime ? ` · ${fmtTime(req.preferredTime)}` : ""}{shooter ? ` · ${shooter}` : " · any photographer"}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {req.requestedServices.map((s, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-secondary text-xs text-secondary-foreground">{s.label} · ${Number(s.price).toFixed(0)}</span>
                    ))}
                    <span className="px-2 py-0.5 rounded bg-primary/10 text-xs text-primary font-medium">Total ${total.toFixed(0)}</span>
                  </div>
                  <p className="text-xs mb-2 flex items-center gap-1.5">
                    <User className="w-3 h-3 flex-shrink-0" />
                    {req.agentWillMeet
                      ? <span className="text-emerald-400 font-medium">Agent will meet on-site</span>
                      : <span className="text-muted-foreground">Lockbox / gate-code access (agent not meeting)</span>}
                  </p>
                  <p className="text-xs mb-2 flex items-center gap-1.5">
                    <Home className="w-3 h-3 flex-shrink-0" />
                    {req.isVacant
                      ? <span className="text-amber-400 font-medium">Property is vacant</span>
                      : <span className="text-muted-foreground">Property is occupied</span>}
                  </p>
                  {req.notes && <p className="text-xs text-muted-foreground mb-3 italic">"{req.notes}"</p>}
                  <div className="flex gap-2">
                    <Button onClick={() => handleApprove(req)} disabled={busyId === req.id} className="flex-1 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
                      <Check className="w-4 h-4" /> Approve & schedule
                    </Button>
                    <Button variant="outline" onClick={() => { setDeclineTarget(req); setDeclineNote(""); }} disabled={busyId === req.id} className="gap-1.5 border-border text-muted-foreground hover:text-destructive">
                      <X className="w-4 h-4" /> Decline
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Decline reason */}
      <Dialog open={!!declineTarget} onOpenChange={o => !o && setDeclineTarget(null)}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Decline this request?</DialogTitle>
          </DialogHeader>
          <div>
            <Label className="text-xs text-muted-foreground">Note to the agent (optional)</Label>
            <Input value={declineNote} onChange={e => setDeclineNote(e.target.value)} placeholder="e.g. that time's booked — try next week" className="mt-1" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeclineTarget(null)} className="text-muted-foreground">Cancel</Button>
            <Button onClick={handleDecline} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Decline</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
