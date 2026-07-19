// ============================================================
// ClientDashboardPage — Client-facing dashboard
// Shows their projects, statuses, and invoices
// ============================================================

import { useMemo, useState, useEffect } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import type { InvoiceStatus, SeriesEpisode, Project } from "@/lib/types";
import { Link, Redirect, useLocation } from "wouter";
import { CalendarDays, Film, CheckCircle, FileText, ArrowRight, Clock, MapPin, AlertCircle, Clapperboard, Plus, Building2, CreditCard, Images, Receipt } from "lucide-react";
import RequestShootDialog from "@/components/RequestShootDialog";
import ProjectDetailSheet from "@/components/ProjectDetailSheet";
import { hasAcceptedAgreement } from "@/lib/agreements";
import { getProjectInvoiceAmount, getProjectPayerId } from "@/lib/data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  upcoming: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  filming_done: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  in_editing: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  completed: "bg-green-500/20 text-green-300 border-green-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  upcoming: "Upcoming",
  filming_done: "Filmed",
  in_editing: "In Editing",
  completed: "Completed",
};

const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
  sent: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  paid: "bg-green-500/20 text-green-300 border-green-500/30",
  void: "bg-red-500/20 text-red-300 border-red-500/30",
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

function formatDate(d: string): string {
  if (!d) return "";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function ClientDashboardPage() {
  const { data, fetchEpisodes } = useApp();
  const { effectiveProfile } = useAuth();
  // A brokerage account has its own home (agents + what they owe), not the
  // standard client dashboard. Computed here; redirect happens after all hooks.
  const myClientId = effectiveProfile?.clientIds?.[0] ?? "";
  const myClient = data.clients.find(c => c.id === myClientId);
  const isBroker = myClient?.clientType === "broker";
  // Agents book straight from here. If they still need a card/agreement, send
  // them to My Listings where that gate lives; otherwise open the request.
  const isAgent = myClient?.clientType === "agent";
  const isPhotography = myClient?.clientType === "photography";
  // An agent whose brokerage covers them: their shoots bill to the broker, so
  // they should see a statement of what was shot — never a balance to pay.
  const broker = isAgent && myClient?.brokerId ? data.clients.find(c => c.id === myClient.brokerId) : null;
  const coveredByBroker = !!broker;
  const brokerName = broker?.company ?? "your brokerage";
  // Split the gate so the booking button can say exactly what's needed next,
  // instead of silently bouncing the agent to another page.
  const needsCard = isAgent && !myClient?.cardOnFile;
  const needsAgreement = isAgent && !hasAcceptedAgreement(myClient);
  const bookingGated = needsCard || needsAgreement;
  const [, navigate] = useLocation();
  const [requestOpen, setRequestOpen] = useState(false);
  const [detailProject, setDetailProject] = useState<Project | null>(null);
  const startBooking = () => { if (bookingGated) navigate("/my-houses"); else setRequestOpen(true); };
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const thirtyDaysOut = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Status counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { upcoming: 0, filming_done: 0, in_editing: 0, completed: 0 };
    data.projects.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });
    return counts;
  }, [data.projects]);

  // Completed this month
  const completedThisMonth = useMemo(() => {
    return data.projects.filter(p => {
      if (p.status !== "editing_done" && p.status !== "delivered") return false;
      const d = new Date(p.date + "T00:00:00");
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    }).length;
  }, [data.projects, currentYear, currentMonth]);

  // Outstanding invoices
  const outstandingAmount = useMemo(() => {
    return data.invoices
      .filter(inv => inv.status === "draft" || inv.status === "sent")
      .reduce((sum, inv) => sum + inv.total, 0);
  }, [data.invoices]);

  // Broker-covered agent: a statement of the shoots their broker actually pays
  // (date · property · price). A shoot re-pointed to the agent (Bill to = agent)
  // is excluded here — it bills to them, so it shows as a real balance instead.
  const clientsById = useMemo(() => Object.fromEntries(data.clients.map(c => [c.id, c])), [data.clients]);
  const myBilledShoots = useMemo(() => {
    if (!coveredByBroker || !myClient || !broker) return [];
    return data.projects
      .filter(p => getProjectPayerId(p, clientsById) === broker.id)
      .map(p => ({ p, amt: getProjectInvoiceAmount(p, myClient) }))
      .filter(x => x.amt > 0)
      .sort((a, b) => b.p.date.localeCompare(a.p.date));
  }, [coveredByBroker, myClient, broker, data.projects, clientsById]);
  const myShootsBilled = useMemo(() => myBilledShoots.reduce((s, x) => s + x.amt, 0), [myBilledShoots]);

  // "Your photos are ready" nudge: recently-delivered galleries (last 45 days),
  // so the agent sees it in-app instead of only via email. Capped and time-boxed
  // so it's a nudge, not a permanent list.
  const readyPhotos = useMemo(() => {
    const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return data.projects
      .map(p => ({ p, g: data.deliveries.find(d => d.projectId === p.id && d.status === "delivered") }))
      .filter((x): x is { p: Project; g: NonNullable<typeof x.g> } => !!x.g && x.p.date >= cutoff)
      .sort((a, b) => b.p.date.localeCompare(a.p.date))
      .slice(0, 5)
      .map(({ p, g }) => ({
        id: p.id,
        label: data.locations.find(l => l.id === p.locationId)?.name || "Your shoot",
        url: `${window.location.origin}${g.slug ? `/g/${g.slug}` : `/deliver/${g.token}`}`,
      }));
  }, [data.projects, data.deliveries, data.locations]);

  // "What you owe" = invoices billed to the agent themselves (self-pay agents,
  // or shoots a broker declined and you re-pointed to the agent). Honest for all.
  const showOwe = !coveredByBroker || outstandingAmount > 0;

  // Upcoming projects (next 30 days)
  const upcomingProjects = useMemo(() => {
    return data.projects
      .filter(p => p.date >= todayStr && p.date <= thirtyDaysOut)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data.projects, todayStr, thirtyDaysOut]);

  // Recent invoices
  const recentInvoices = useMemo(() => {
    return data.invoices.slice(0, 5);
  }, [data.invoices]);

  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  // Pay an invoice via Stripe Checkout (same flow as My Photos / My Listings).
  const handlePay = async (invId: string, viewToken: string) => {
    if (!viewToken) { toast.error("This invoice isn't ready to pay yet — ask for it to be re-sent."); return; }
    setPayingId(invId);
    try {
      const res = await fetch("/api/stripe-payment?action=checkout-by-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: viewToken, successUrl: `${window.location.origin}/?paid=1`, cancelUrl: window.location.origin }),
      });
      const body = await res.json().catch(() => ({ error: "Failed" }));
      if (!res.ok) throw new Error(body.error || "Couldn't start checkout");
      window.location.assign(body.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start checkout");
      setPayingId(null);
    }
  };

  // Projects by status
  const projectsByStatus = useMemo(() => ({
    upcoming: data.projects.filter(p => p.status === "upcoming" || p.status === "tentative").sort((a, b) => a.date.localeCompare(b.date)),
    in_editing: data.projects.filter(p => p.status === "in_editing").sort((a, b) => b.date.localeCompare(a.date)),
    completed: data.projects.filter(p => p.status === "editing_done" || p.status === "delivered").sort((a, b) => b.date.localeCompare(a.date)),
  }), [data.projects]);

  // Episodes needing review
  const [reviewEpisodes, setReviewEpisodes] = useState<(SeriesEpisode & { seriesName: string })[]>([]);
  useEffect(() => {
    async function loadReviewEpisodes() {
      const results: (SeriesEpisode & { seriesName: string })[] = [];
      for (const s of data.series) {
        try {
          const episodes = await fetchEpisodes(s.id);
          for (const ep of episodes) {
            if (ep.status === "client_review" || ep.status === "review") {
              results.push({ ...ep, seriesName: s.name });
            }
          }
        } catch { /* ignore */ }
      }
      setReviewEpisodes(results);
    }
    if (data.series.length > 0) loadReviewEpisodes();
  }, [data.series, fetchEpisodes]);

  // Brokerage accounts get their own home, not the standard client dashboard.
  if (isBroker) return <Redirect to="/my-houses" />;

  // Photography clients get a stripped-down home: upcoming shoots, invoices,
  // and a link to their galleries. Nothing else.
  if (isPhotography) {
    const invoices = data.invoices.slice().sort((a, b) => (b.issueDate || "").localeCompare(a.issueDate || ""));
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {myClient?.company ? `Hi, ${(myClient.contactName || myClient.company).split(" ")[0]}` : "Welcome"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your shoots, galleries, and invoices</p>
        </div>

        <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-5 max-w-2xl w-full mx-auto">
          {/* Galleries */}
          <button onClick={() => navigate("/my-houses")} className="w-full bg-primary text-primary-foreground rounded-lg px-5 py-4 flex items-center justify-between gap-3 hover:bg-primary/90 transition-colors">
            <span className="flex items-center gap-2 font-semibold"><Images className="w-5 h-5" /> View my photos</span>
            <ArrowRight className="w-5 h-5" />
          </button>

          {/* Upcoming shoots */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Upcoming shoots</h2>
            </div>
            {upcomingProjects.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No upcoming shoots scheduled.</div>
            ) : (
              upcomingProjects.map(p => {
                const pType = data.projectTypes.find(t => t.id === p.projectTypeId);
                const loc = data.locations.find(l => l.id === p.locationId);
                return (
                  <div key={p.id} onClick={() => setDetailProject(p)} className="px-4 py-3 border-b border-border/50 last:border-0 flex items-start justify-between gap-3 cursor-pointer hover:bg-secondary/30 transition-colors">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">{pType?.name ?? "Shoot"}</div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{p.startTime}{p.endTime ? ` — ${p.endTime}` : ""}</span>
                        {loc && <span className="flex items-center gap-1 min-w-0"><MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{loc.name}</span></span>}
                      </div>
                    </div>
                    <span className="text-xs font-medium text-primary shrink-0">{formatDate(p.date)}</span>
                  </div>
                );
              })
            )}
          </div>

          {/* Invoices */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Receipt className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Invoices</h2>
            </div>
            {invoices.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No invoices yet.</div>
            ) : (
              invoices.map(inv => (
                <div key={inv.id} className="px-4 py-3 border-b border-border/50 last:border-0 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{inv.invoiceNumber} · {formatCurrency(inv.total)}</div>
                    {inv.issueDate && <div className="text-xs text-muted-foreground">{formatDate(inv.issueDate)}</div>}
                  </div>
                  {inv.status === "paid" ? (
                    <span className="text-xs font-medium px-2.5 py-1 rounded border border-green-500/30 bg-green-500/15 text-green-300 shrink-0">Paid</span>
                  ) : inv.status === "sent" ? (
                    <button onClick={() => handlePay(inv.id, inv.viewToken)} disabled={payingId === inv.id} className="text-xs font-medium px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 disabled:opacity-60">
                      {payingId === inv.id ? "Opening…" : `Pay ${formatCurrency(inv.total)}`}
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground capitalize shrink-0">{inv.status}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {detailProject && <ProjectDetailSheet project={detailProject} onClose={() => setDetailProject(null)} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
        <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your projects and invoices</p>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-5">
        {/* Your photos are ready — an in-app nudge for recently delivered galleries */}
        {readyPhotos.length > 0 && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Images className="w-5 h-5 text-emerald-500" /> Your photos are ready
            </div>
            <div className="space-y-1.5">
              {readyPhotos.map(r => (
                <a key={r.id} href={r.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-md bg-background/60 px-3 py-2 hover:bg-background transition-colors">
                  <span className="text-sm text-foreground min-w-0 truncate">{r.label}</span>
                  <span className="text-xs font-medium text-emerald-600 shrink-0 flex items-center gap-1">View &amp; download <ArrowRight className="w-3.5 h-3.5" /></span>
                </a>
              ))}
            </div>
          </div>
        )}
        {/* Agents: book a shoot right from the home screen */}
        {isAgent && (
          <button onClick={startBooking} className="w-full bg-primary text-primary-foreground rounded-lg px-5 py-4 flex items-center justify-between gap-3 hover:bg-primary/90 transition-colors">
            <span className="flex items-center gap-2 font-semibold">
              <Plus className="w-5 h-5" /> {needsCard ? "Add a card to book" : needsAgreement ? "Review agreement to book" : "Request a shoot"}
            </span>
            <ArrowRight className="w-5 h-5" />
          </button>
        )}
        {/* Agents: who's paying — broker coverage or self-pay, at a glance. */}
        {isAgent && (
          coveredByBroker ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
              <Building2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="text-sm text-foreground">Your broker <span className="font-medium">{brokerName}</span> pays for your shoots — nothing comes out of your pocket.</span>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-3">
              <CreditCard className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-foreground">You pay for your own shoots — billed to your card on file.</span>
            </div>
          )
        )}
        {/* Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard icon={CalendarDays} iconColor="text-blue-400" iconBg="bg-blue-500/20"
            label="Upcoming" value={String(statusCounts.upcoming)} sub="Scheduled shoots"
            onClick={() => setExpandedSection(expandedSection === "upcoming" ? null : "upcoming")}
            active={expandedSection === "upcoming"} />
          <MetricCard icon={Film} iconColor="text-purple-400" iconBg="bg-purple-500/20"
            label="In Editing" value={String(statusCounts.in_editing)} sub="Being edited now"
            onClick={() => setExpandedSection(expandedSection === "in_editing" ? null : "in_editing")}
            active={expandedSection === "in_editing"} />
          <MetricCard icon={CheckCircle} iconColor="text-green-400" iconBg="bg-green-500/20"
            label="Completed" value={String(completedThisMonth)} sub="This month"
            onClick={() => setExpandedSection(expandedSection === "completed" ? null : "completed")}
            active={expandedSection === "completed"} />
          <MetricCard icon={FileText} iconColor="text-cyan-400" iconBg="bg-cyan-500/20"
            label={!showOwe ? "Billed to broker" : "Outstanding"}
            value={formatCurrency(!showOwe ? myShootsBilled : outstandingAmount)}
            sub={!showOwe ? `Paid by ${brokerName}` : (coveredByBroker ? "Due from you" : "Unpaid invoices")}
            onClick={() => setExpandedSection(expandedSection === "outstanding" ? null : "outstanding")}
            active={expandedSection === "outstanding"} />
        </div>

        {/* Expanded Project List */}
        {expandedSection && expandedSection !== "outstanding" && (
          <div className="bg-card border border-border rounded-lg">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {expandedSection === "upcoming" ? "Upcoming Shoots" : expandedSection === "in_editing" ? "In Editing" : "Completed Projects"}
              </h3>
            </div>
            <div className="divide-y divide-border max-h-80 overflow-auto">
              {(projectsByStatus[expandedSection as keyof typeof projectsByStatus] || []).length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No projects</div>
              ) : (
                (projectsByStatus[expandedSection as keyof typeof projectsByStatus] || []).slice(0, 20).map(p => {
                  const pType = data.projectTypes.find(t => t.id === p.projectTypeId);
                  const loc = data.locations.find(l => l.id === p.locationId);
                  return (
                    <div key={p.id} onClick={() => setDetailProject(p)} className="px-4 py-3 cursor-pointer hover:bg-secondary/30 transition-colors">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-sm font-medium text-foreground">{pType?.name ?? "Project"}</span>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{p.startTime} — {p.endTime}</span>
                            {loc && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{loc.name}</span>}
                          </div>
                          {p.deliverableUrl && (
                            <a href={p.deliverableUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 mt-1 text-xs text-primary hover:text-primary/80">
                              View Deliverables
                            </a>
                          )}
                        </div>
                        <span className="text-xs font-medium text-primary shrink-0">{formatDate(p.date)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Billing expanded: what you owe (if any) + broker-covered statement */}
        {expandedSection === "outstanding" && (
          <div className="space-y-3">
            {/* What you owe — your own invoices (self-pay, or shoots re-pointed to you) */}
            {showOwe && (
              <div className="bg-card border border-border rounded-lg">
                <div className="px-4 py-3 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    Outstanding Invoices
                  </h3>
                  {coveredByBroker && <p className="text-xs text-muted-foreground mt-0.5">Shoots your brokerage didn't cover — due from you.</p>}
                </div>
                <div className="divide-y divide-border max-h-80 overflow-auto">
                  {data.invoices.filter(inv => inv.status === "draft" || inv.status === "sent").length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">No outstanding invoices</div>
                  ) : (
                    data.invoices.filter(inv => inv.status === "draft" || inv.status === "sent").map(inv => (
                      <div key={inv.id} className="px-4 py-3 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{inv.invoiceNumber}</span>
                            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", INVOICE_STATUS_COLORS[inv.status])}>
                              {inv.status}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatDate(inv.periodStart)} — {formatDate(inv.periodEnd)}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-foreground">{formatCurrency(inv.total)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            {/* Broker-covered statement — informational, no balance */}
            {coveredByBroker && (
              <div className="bg-card border border-border rounded-lg">
                <div className="px-4 py-3 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    Billed to Your Brokerage
                  </h3>
                </div>
                <div className="px-4 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" /> Covered by {brokerName} — nothing is due from you for these.
                </div>
                <div className="divide-y divide-border max-h-80 overflow-auto">
                  {myBilledShoots.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">No shoots billed yet</div>
                  ) : (
                    myBilledShoots.map(({ p, amt }) => {
                      const loc = data.locations.find(l => l.id === p.locationId);
                      return (
                        <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-foreground truncate block">{loc?.name ?? "Shoot"}</span>
                            <p className="text-xs text-muted-foreground mt-0.5">{formatDate(p.date)}</p>
                          </div>
                          <span className="text-sm font-semibold text-foreground shrink-0">{formatCurrency(amt)}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Needs Your Review */}
        {reviewEpisodes.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-amber-300" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Needs Your Review
              </h3>
            </div>
            <div className="space-y-2">
              {reviewEpisodes.map(ep => (
                <Link key={ep.id} href={`/series/${ep.seriesId}`}>
                  <div className="flex items-center justify-between bg-card/50 rounded-md px-3 py-2 hover:bg-card transition-colors cursor-pointer">
                    <div>
                      <span className="text-sm text-foreground font-medium">Episode {ep.episodeNumber}: {ep.title}</span>
                      <p className="text-xs text-muted-foreground">{ep.seriesName}</p>
                    </div>
                    <span className="text-xs text-amber-400 font-medium">Review</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Active Series */}
        {data.series.length > 0 && (
          <div className="bg-card border border-border rounded-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Active Series
              </h3>
              <Link href="/series" className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                All Series <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {data.series.slice(0, 3).map(s => (
                <Link key={s.id} href={`/series/${s.id}`}>
                  <div className="px-4 py-3 flex items-center justify-between hover:bg-secondary/30 transition-colors cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Clapperboard className="w-4 h-4 text-purple-400" />
                      <span className="text-sm text-foreground">{s.name}</span>
                    </div>
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Upcoming Projects */}
          <div className="bg-card border border-border rounded-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Upcoming Projects
              </h3>
              <Link href="/calendar" className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                Calendar <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {upcomingProjects.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No upcoming projects</div>
              ) : (
                upcomingProjects.slice(0, 6).map(p => {
                  const pType = data.projectTypes.find(t => t.id === p.projectTypeId);
                  const loc = data.locations.find(l => l.id === p.locationId);
                  return (
                    <div key={p.id} onClick={() => setDetailProject(p)} className="px-4 py-3 cursor-pointer hover:bg-secondary/30 transition-colors">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{pType?.name ?? "Project"}</span>
                            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", STATUS_COLORS[p.status])}>
                              {STATUS_LABELS[p.status] ?? p.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{p.startTime} — {p.endTime}</span>
                            {loc && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{loc.name}</span>}
                          </div>
                        </div>
                        <span className="text-xs font-medium text-primary shrink-0">{formatDate(p.date)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Recent Invoices */}
          <div className="bg-card border border-border rounded-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {coveredByBroker && outstandingAmount === 0 ? "Billing" : "Invoices"}
              </h3>
            </div>
            {coveredByBroker && outstandingAmount === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                Your shoots are billed to <span className="text-foreground font-medium">{brokerName}</span>. You won't get a bill or owe anything for them.
              </div>
            ) : (
            <div className="divide-y divide-border">
              {recentInvoices.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No invoices yet</div>
              ) : (
                recentInvoices.map(inv => (
                  <div key={inv.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{inv.invoiceNumber}</span>
                        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", INVOICE_STATUS_COLORS[inv.status])}>
                          {inv.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(inv.periodStart)} — {formatDate(inv.periodEnd)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-foreground">{formatCurrency(inv.total)}</span>
                  </div>
                ))
              )}
            </div>
            )}
          </div>
        </div>

        {/* Project Status Overview */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            All Projects by Status
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(["upcoming", "filming_done", "in_editing", "completed"] as const).map(status => (
              <div key={status} className="text-center p-3 rounded-lg bg-secondary/30">
                <p className="text-2xl font-semibold text-foreground">{statusCounts[status] || 0}</p>
                <p className={cn("text-xs font-medium mt-1", STATUS_COLORS[status].split(" ").find(c => c.startsWith("text-")))}>
                  {STATUS_LABELS[status]}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isAgent && <RequestShootDialog open={requestOpen} onClose={() => setRequestOpen(false)} clientId={myClientId} />}
      {detailProject && <ProjectDetailSheet project={detailProject} onClose={() => setDetailProject(null)} />}
    </div>
  );
}

function MetricCard({ icon: Icon, iconColor, iconBg, label, value, sub, onClick, active }: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  label: string;
  value: string;
  sub: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-card border rounded-lg p-4 transition-colors",
        onClick && "cursor-pointer hover:border-primary/30",
        active ? "border-primary/50 bg-primary/5" : "border-border",
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", iconBg)}>
          <Icon className={cn("w-5 h-5", iconColor)} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold text-foreground truncate">{value}</p>
          <p className="text-[10px] text-muted-foreground/60">{sub}</p>
        </div>
      </div>
    </div>
  );
}
