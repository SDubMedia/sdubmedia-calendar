// ============================================================
// MyHousesPage — the agent's home. Lists their listings/shoots (date, time,
// address, status), shows the status of any requests they've submitted, and
// lets them request a new shoot. Agent-safe: no cost/margin, only their own.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Home, Plus, Clock, MapPin, CheckCircle2, Hourglass, XCircle, UserPlus, User, Receipt, CreditCard, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { useAuth } from "@/contexts/AuthContext";
import RequestShootDialog from "@/components/RequestShootDialog";
import InviteAgentDialog from "@/components/InviteAgentDialog";
import { getProjectInvoiceAmount } from "@/lib/data";
import { getAuthToken } from "@/lib/supabase";
import { hasAcceptedAgreement } from "@/lib/agreements";
import AgreementDialog from "@/components/AgreementDialog";
import { toast } from "sonner";

function fmtDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function fmtTime(t: string): string {
  const [hs, m] = (t || "").split(":");
  const h = Number(hs); if (Number.isNaN(h)) return t || "";
  const ampm = h >= 12 ? "PM" : "AM"; const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${ampm}`;
}

export default function MyHousesPage() {
  const { data } = useApp();
  const { effectiveProfile } = useAuth();
  const [requestOpen, setRequestOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const myClientId = effectiveProfile?.clientIds?.[0] ?? "";
  const myClient = useMemo(() => data.clients.find(c => c.id === myClientId), [data.clients, myClientId]);
  const isBroker = (myClient?.clientType ?? "") === "broker";
  const isAgent = (myClient?.clientType ?? "") === "agent";
  // Agents must keep a card on file before they can request shoots — a fallback
  // if their broker doesn't pay. Brokers are exempt (invoiced monthly).
  const needsCard = isAgent && !myClient?.cardOnFile;
  // One-time disclosure: agents accept service+card terms, brokers a billing
  // agreement, before booking / inviting. Re-prompts if the terms version bumps.
  const agreed = hasAcceptedAgreement(myClient);
  const needsAgreement = (isAgent || isBroker) && !agreed;
  // Broker's agents (visible via the broker_read_agents policy).
  const agents = useMemo(() => data.clients.filter(c => c.brokerId === myClientId), [data.clients, myClientId]);

  const houses = useMemo(
    () => [...data.projects].sort((a, b) => b.date.localeCompare(a.date)),
    [data.projects]
  );
  const pending = useMemo(() => data.shootRequests.filter(r => r.status === "pending"), [data.shootRequests]);
  const declined = useMemo(() => data.shootRequests.filter(r => r.status === "declined"), [data.shootRequests]);

  const locName = (locationId: string) => data.locations.find(l => l.id === locationId)?.name ?? "Address TBD";
  const agentName = (clientId: string) => data.clients.find(c => c.id === clientId)?.company ?? "";
  // A house's gallery is viewable once the owner has DELIVERED it (released).
  const galleryFor = (projectId: string) => data.deliveries.find(d => d.projectId === projectId && d.status === "delivered");
  const galleryUrl = (d: { slug: string | null; token: string }) => `${window.location.origin}${d.slug ? `/g/${d.slug}` : `/deliver/${d.token}`}`;

  // What the broker owes — every project they can see is one they're the payer
  // for (agents' shoots + anything billed directly to them, e.g. a live event).
  // Priced like Reports: per-piece price, never cost.
  const clientsById = useMemo(() => Object.fromEntries(data.clients.map(c => [c.id, c])), [data.clients]);
  const now = new Date();
  const yr = String(now.getFullYear());
  const ym = `${yr}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const owedFor = (filter: (d: string) => boolean) => {
    const ps = houses.filter(p => filter(p.date));
    const total = myClient ? ps.reduce((s, p) => s + getProjectInvoiceAmount(p, clientsById[p.clientId] ?? myClient), 0) : 0;
    return { total, count: ps.length };
  };
  const month = owedFor(d => d.startsWith(ym));
  const year = owedFor(d => d.startsWith(yr));
  const money = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

  // Invoices the broker can pay — their own, that you've SENT (not drafts).
  const myInvoices = useMemo(
    () => data.invoices.filter(i => i.clientId === myClientId).sort((a, b) => (b.issueDate || "").localeCompare(a.issueDate || "")),
    [data.invoices, myClientId]
  );
  const [payingId, setPayingId] = useState<string | null>(null);

  // Bounce-back after a successful Stripe checkout.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("paid") === "1") toast.success("Payment received — thank you!");
    if (q.get("card") === "1") toast.success("Card saved — you can request shoots now.");
  }, []);

  const handlePay = async (invId: string, viewToken: string) => {
    if (!viewToken) { toast.error("This invoice isn't ready to pay yet — ask for it to be re-sent."); return; }
    setPayingId(invId);
    try {
      const res = await fetch("/api/stripe-payment?action=checkout-by-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: viewToken,
          successUrl: `${window.location.origin}/my-houses?paid=1`,
          cancelUrl: `${window.location.origin}/my-houses`,
        }),
      });
      const body = await res.json().catch(() => ({ error: "Failed" }));
      if (!res.ok) throw new Error(body.error || "Couldn't start checkout");
      window.location.assign(body.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start checkout");
      setPayingId(null);
    }
  };

  const [addingCard, setAddingCard] = useState(false);
  const handleAddCard = async () => {
    setAddingCard(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/stripe-save-card", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          successUrl: `${window.location.origin}/my-houses?card=1`,
          cancelUrl: `${window.location.origin}/my-houses`,
        }),
      });
      const body = await res.json().catch(() => ({ error: "Failed" }));
      if (!res.ok) throw new Error(body.error || "Couldn't start card setup");
      window.location.assign(body.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start card setup");
      setAddingCard(false);
    }
  };

  // Agreement gate. Agents fold it into the card step; brokers accept standalone.
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [agreementNext, setAgreementNext] = useState<"card" | "invite" | null>(null);
  const openAgreement = (next: "card" | "invite" | null) => { setAgreementNext(next); setAgreementOpen(true); };
  // Agent taps "Add a card to book": agree first (if needed), then Stripe.
  const startCardFlow = () => { if (needsAgreement) openAgreement("card"); else handleAddCard(); };
  // Broker taps "Invite agent": agree first (if needed), then invite.
  const startInvite = () => { if (needsAgreement) openAgreement("invite"); else setInviteOpen(true); };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50 flex-wrap gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{isBroker ? "My Agents" : "My Houses"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{isBroker ? `${agents.length} agent${agents.length !== 1 ? "s" : ""} · ${houses.length} shoot${houses.length !== 1 ? "s" : ""}` : `${houses.length} shoot${houses.length !== 1 ? "s" : ""}`}</p>
        </div>
        {isBroker ? (
          <Button onClick={startInvite} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
            <UserPlus className="w-4 h-4" /> Invite agent
          </Button>
        ) : needsCard ? (
          <Button onClick={startCardFlow} disabled={addingCard} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
            <CreditCard className="w-4 h-4" /> {addingCard ? "Opening…" : "Add a card to book"}
          </Button>
        ) : needsAgreement ? (
          <Button onClick={() => openAgreement(null)} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
            <CreditCard className="w-4 h-4" /> Review agreement to book
          </Button>
        ) : (
          <Button onClick={() => setRequestOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
            <Plus className="w-4 h-4" /> Request a shoot
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 max-w-2xl w-full mx-auto space-y-6">
        {/* Broker: one-time billing agreement prompt */}
        {isBroker && needsAgreement && (
          <button onClick={() => openAgreement(null)} className="w-full text-left bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3 hover:bg-amber-500/15 transition-colors">
            <CreditCard className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">Review the billing agreement</div>
              <p className="text-xs text-muted-foreground mt-0.5">A quick one-time agreement covering how your agents' shoots are billed to your brokerage. Tap to read and accept.</p>
            </div>
          </button>
        )}
        {/* Agent: card-on-file status / prompt */}
        {needsCard && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
            <CreditCard className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">Add a card before booking</div>
              <p className="text-xs text-muted-foreground mt-0.5">We keep a card on file in case your broker doesn't cover a shoot. It's saved, not charged — you'll only be billed if needed.</p>
            </div>
          </div>
        )}
        {isAgent && myClient?.cardOnFile && (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5" />
            Card on file{myClient.cardBrand ? ` — ${myClient.cardBrand}${myClient.cardLast4 ? ` ···· ${myClient.cardLast4}` : ""}` : ""}
            <button onClick={handleAddCard} disabled={addingCard} className="text-primary hover:underline ml-1">Update</button>
          </div>
        )}
        {/* Broker: what you owe */}
        {isBroker && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">This month</div>
              <div className="text-2xl font-semibold text-foreground mt-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{money(month.total)}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{month.count} project{month.count !== 1 ? "s" : ""}</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">This year</div>
              <div className="text-2xl font-semibold text-foreground mt-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{money(year.total)}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{year.count} project{year.count !== 1 ? "s" : ""}</div>
            </div>
          </div>
        )}

        {/* Broker: invoices + pay (only invoices you've sent are payable) */}
        {isBroker && myInvoices.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><Receipt className="w-3 h-3" /> Invoices</div>
            <div className="space-y-2">
              {myInvoices.map(inv => (
                <div key={inv.id} className="bg-card border border-border rounded-lg p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">#{inv.invoiceNumber} · {money(inv.total)}</div>
                    {inv.issueDate && <div className="text-xs text-muted-foreground">{inv.issueDate}</div>}
                  </div>
                  {inv.status === "paid" ? (
                    <Badge className="bg-green-500/15 text-green-600 dark:text-green-300 border-green-500/30 flex-shrink-0">Paid</Badge>
                  ) : inv.status === "sent" ? (
                    <Button onClick={() => handlePay(inv.id, inv.viewToken)} disabled={payingId === inv.id} className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 flex-shrink-0">
                      <CreditCard className="w-4 h-4" /> {payingId === inv.id ? "Opening…" : `Pay ${money(inv.total)}`}
                    </Button>
                  ) : (
                    <Badge variant="outline" className="border-border text-muted-foreground capitalize flex-shrink-0">{inv.status}</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Broker: agent roster */}
        {isBroker && (
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><User className="w-3 h-3" /> Agents</div>
            {agents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No agents yet. Invite your first one.</p>
            ) : (
              <div className="grid gap-2">
                {agents.map(a => (
                  <div key={a.id} className="bg-card border border-border rounded-lg p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{a.company}</div>
                      {a.email && <div className="text-xs text-muted-foreground truncate">{a.email}</div>}
                    </div>
                    <Badge variant="outline" className="border-border text-muted-foreground flex-shrink-0">
                      {houses.filter(p => p.clientId === a.id).length} shoots
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pending requests */}
        {pending.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><Hourglass className="w-3 h-3" /> Awaiting confirmation</div>
            <div className="space-y-2">
              {pending.map(r => (
                <div key={r.id} className="bg-card border border-amber-500/30 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{r.propertyAddress}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDate(r.preferredDate ?? "")}{r.preferredTime ? ` · ${fmtTime(r.preferredTime)}` : ""}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{r.requestedServices.map(s => s.label).join(", ")}</div>
                    </div>
                    <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30 flex-shrink-0">Pending</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Declined requests */}
        {declined.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><XCircle className="w-3 h-3" /> Couldn't schedule</div>
            <div className="space-y-2">
              {declined.map(r => (
                <div key={r.id} className="bg-card border border-border rounded-lg p-3">
                  <div className="text-sm font-medium text-foreground truncate">{r.propertyAddress}</div>
                  {r.ownerResponse && <div className="text-xs text-muted-foreground mt-0.5">{r.ownerResponse}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scheduled houses */}
        <div>
          {(pending.length > 0 || declined.length > 0) && houses.length > 0 && (
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" /> Scheduled</div>
          )}
          {houses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Home className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">{isBroker ? "No shoots yet for your agents." : "No shoots yet. Request your first one."}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {houses.map(p => (
                <div key={p.id} className="bg-card border border-border rounded-lg p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <Home className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate flex items-center gap-1"><MapPin className="w-3 h-3 flex-shrink-0 text-muted-foreground" />{locName(p.locationId)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDate(p.date)}{p.startTime ? ` · ${fmtTime(p.startTime)}` : ""}{isBroker && agentName(p.clientId) ? ` · ${agentName(p.clientId)}` : ""}</div>
                    {(() => { const g = galleryFor(p.id); return g ? (
                      <a href={galleryUrl(g)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <ImageIcon className="w-3 h-3" /> View photos
                      </a>
                    ) : null; })()}
                  </div>
                  <Badge variant="outline" className="border-border text-muted-foreground capitalize flex-shrink-0">{p.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <RequestShootDialog open={requestOpen} onClose={() => setRequestOpen(false)} clientId={myClientId} />
      <InviteAgentDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <AgreementDialog
        open={agreementOpen}
        onClose={() => setAgreementOpen(false)}
        kind={isBroker ? "broker" : "agent"}
        agreeLabel={agreementNext === "card" ? "Agree & add card" : "Agree"}
        onAccepted={() => { if (agreementNext === "card") handleAddCard(); else if (agreementNext === "invite") setInviteOpen(true); }}
      />
    </div>
  );
}
