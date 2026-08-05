// ============================================================
// StaffDashboardPage — Crew member dashboard
// Shows their schedule, hours, and pay
// ============================================================

import { useCallback, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";
import { CalendarDays, Clock, DollarSign, ArrowRight, MapPin, Briefcase, Film, CheckCircle2, Download, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCrewMemberProjectPay } from "@/lib/data";
import type { Project, ProjectDocument } from "@/lib/types";
import { Button } from "@/components/ui/button";
import StaffAgreementResign from "@/components/StaffAgreementResign";
import SignedAgreementDialog from "@/components/SignedAgreementDialog";
import { STAFF_AGREEMENT_VERSION, defaultAgreementText } from "@/lib/staffAgreement";
import { FileSignature } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  tentative: "bg-amber-400/15 text-amber-300 border border-dashed border-amber-400/40",
  upcoming: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  filming_done: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  in_editing: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  editing_done: "bg-teal-500/20 text-teal-300 border-teal-500/30",
  delivered: "bg-green-500/20 text-green-300 border-green-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  tentative: "Tentative",
  upcoming: "Upcoming",
  filming_done: "Filmed",
  in_editing: "Editing",
  editing_done: "Editing Done",
  delivered: "Delivered",
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

function formatDate(d: string): string {
  if (!d) return "";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function StaffDashboardPage() {
  const { data } = useApp();
  const { effectiveProfile } = useAuth();
  const crewMemberId = effectiveProfile?.crewMemberId || "";
  const [viewSigned1099, setViewSigned1099] = useState(false);
  // My most-recent signed 1099 (any version), for viewing my executed copy.
  const mySigned1099 = data.staffAgreements
    .filter(a => a.crewMemberId === crewMemberId && a.staffSignedAt)
    .sort((a, b) => (b.staffSignedAt || "").localeCompare(a.staffSignedAt || ""))[0];
  const orgName = data.organization?.name || "";
  const currentAgreementVersion = (data.organization?.staffAgreementVersion || "").trim() || STAFF_AGREEMENT_VERSION;
  const currentAgreementText = (data.organization?.staffAgreementText || "").trim() || defaultAgreementText(orgName);
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  // All my projects
  const myProjects = useMemo(() => {
    if (!crewMemberId) return [];
    return data.projects.filter(p =>
      p.crew.some(c => c.crewMemberId === crewMemberId) ||
      p.postProduction.some(c => c.crewMemberId === crewMemberId)
    );
  }, [data.projects, crewMemberId]);

  // ---- The edit queue. An editor's work isn't scheduled by shoot date, so
  // "upcoming" tells them nothing. What they need is: what's on me, what am I
  // waiting on, what's settled. All three read the drafts' review state.
  // What the job is actually for, and whether he's been paid — both already in
  // the data, neither shown to him anywhere until now.
  const deliverablesFor = (p: Project) =>
    (p.editTypes || []).map(id => data.editTypes.find(e => e.id === id)?.name).filter(Boolean).join(" + ");
  const briefFor = (p: Project) =>
    (p.notes || "").trim() || (p.clientNotes || []).map(n => n.text).join(" · ").trim();
  /** Paid / invoiced / not invoiced, from this editor's own contractor invoices. */
  const payStateFor = (p: Project): { label: string; tone: "paid" | "sent" | "none" } => {
    const inv = data.contractorInvoices.find(ci =>
      ci.crewMemberId === crewMemberId && (ci.lineItems || []).some(li => li.projectId === p.id));
    if (!inv) return { label: "Not invoiced", tone: "none" };
    if (inv.paidAt) return { label: "Paid", tone: "paid" };
    return { label: `Invoiced ${inv.invoiceNumber}`, tone: "sent" };
  };

  /** Is this person the PHOTO editor on the job, or the VIDEO editor? Their
   *  next action is completely different: a photo editor uploads the finished
   *  gallery, a video editor posts a cut for review. Showing one the other's
   *  queue is noise. A plain "Editor" role reads as photo. */
  const myEditKind = useCallback((p: Project): "photo" | "video" | null => {
    const mine = (p.postProduction || []).filter(c => c.crewMemberId === crewMemberId && /editor/i.test(c.role || ""));
    if (mine.length === 0) return null;
    return mine.some(c => /video/i.test(c.role || "")) ? "video" : "photo";
  }, [crewMemberId]);

  /** Everything earned this calendar year. Replaces the hours card: an editor
   *  on a flat rate isn't paid by the hour, so hours were a number that only
   *  invited questions. Uses the same helper Staff Payments does, so flat,
   *  hourly and per-image all resolve the same way. */
  const yearPay = useMemo(() => {
    if (!crewMemberId) return 0;
    return data.projects
      .filter(p => p.status !== "cancelled" && p.date.startsWith(String(currentYear)))
      .reduce((sum, p) => sum + getCrewMemberProjectPay(p, crewMemberId), 0);
  }, [data.projects, crewMemberId, currentYear]);

  /** Photo-editor work: which galleries still need their finished photos.
   *  "Ready for you" = the shoot happened and nothing has been uploaded yet. */
  const photoEditJobs = useMemo(() => {
    if (!crewMemberId) return { needsFinals: [] as Project[], uploaded: [] as Project[] };
    const needsFinals: Project[] = [];
    const uploaded: Project[] = [];
    for (const p of data.projects) {
      if (p.status === "cancelled" || myEditKind(p) !== "photo") continue;
      if (p.date > todayStr) continue; // not shot yet — nothing to edit
      const gallery = data.deliveries.find(d => d.projectId === p.id);
      const fileCount = gallery ? data.deliveryFiles.filter(f => f.deliveryId === gallery.id).length : 0;
      // Done means done, however it happened. A job that's been delivered —
      // marked delivered on the project, or its gallery sent — is not work
      // waiting on the editor, even when nothing was uploaded through Slate.
      // Plenty of past jobs were handed over by hand; asking her for finals on
      // those is noise she can't clear.
      const isDone = p.status === "delivered" || gallery?.status === "delivered";
      if (isDone) {
        if (fileCount > 0) uploaded.push(p);   // she did upload — show it as finished
        continue;                              // delivered by hand — off her list entirely
      }
      (fileCount > 0 ? uploaded : needsFinals).push(p);
    }
    return { needsFinals, uploaded };
  }, [data.projects, data.deliveries, data.deliveryFiles, crewMemberId, todayStr, myEditKind]);

  const editJobs = useMemo(() => {
    if (!crewMemberId) return { needsCut: [] as Project[], inReview: [] as { project: Project; doc: ProjectDocument }[], settled: [] as { project: Project; doc: ProjectDocument }[] };
    // Video-edit assignments only — photo editors get their own section, since
    // "post a draft for review" isn't their job.
    const onEdit = data.projects.filter(p => p.status !== "cancelled" && myEditKind(p) === "video");
    const needsCut: Project[] = [];
    const inReview: { project: Project; doc: ProjectDocument }[] = [];
    const settled: { project: Project; doc: ProjectDocument }[] = [];
    for (const p of onEdit) {
      const mine = data.projectDocuments
        .filter(d => d.projectId === p.id && d.kind === "draft")
        .sort((a, b) => b.version - a.version);
      if (mine.length === 0) {
        // Nothing posted yet, and the shoot has happened — it's on him. Unless
        // the job is already delivered, in which case it was handled some other
        // way and there's nothing left to cut.
        if (p.date <= todayStr && p.status !== "delivered") needsCut.push(p);
        continue;
      }
      const latest = mine[0];
      if (latest.reviewStatus === "pending") inReview.push({ project: p, doc: latest });
      else settled.push({ project: p, doc: latest });
    }
    return { needsCut, inReview, settled };
  }, [data.projects, data.projectDocuments, crewMemberId, todayStr, myEditKind]);

  // Upcoming projects
  const upcomingProjects = useMemo(() => {
    return myProjects
      .filter(p => p.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [myProjects, todayStr]);

  // Next shoot
  const _nextShoot = upcomingProjects[0];

  // This month's projects
  const thisMonthProjects = useMemo(() => {
    return myProjects.filter(p => {
      const d = new Date(p.date + "T00:00:00");
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });
  }, [myProjects, currentYear, currentMonth]);

  // Hours and pay this month
  // totalImages is still computed inside (it drives the per-image pay maths)
  // but nothing renders it now that the hours card is gone.
  const { totalHours, totalPay, projectBreakdown } = useMemo(() => {
    let totalHours = 0;
    let totalPay = 0;
    let totalImages = 0;
    const breakdown: { projectId: string; date: string; typeName: string; role: string; hours: number; unit: string; pay: number }[] = [];

    thisMonthProjects.forEach(p => {
      const pType = data.projectTypes.find(t => t.id === p.projectTypeId);
      const isAlsoPhotoEditor = p.editorBilling && p.postProduction.some(
        pp => pp.crewMemberId === crewMemberId && pp.role === "Photo Editor"
      );
      // Crew entries — skip hourly if this person is the photo editor on this project
      p.crew.filter(c => c.crewMemberId === crewMemberId).forEach(e => {
        if (isAlsoPhotoEditor) return; // pay comes from editorBilling
        // Honor flat pay: when payType==="flat", pay is flatAmount, not
        // hours × rate. Flat entries don't contribute to the hours stat
        // (the hours field is often unset/unreliable on flat pay).
        const isFlat = e.payType === "flat";
        const hours = Number(e.hoursWorked ?? 0);
        const pay = isFlat ? Number(e.flatAmount ?? 0) : hours * Number(e.payRatePerHour ?? 0);
        if (!isFlat) totalHours += hours;
        totalPay += pay;
        breakdown.push({ projectId: p.id, date: p.date, typeName: pType?.name ?? "Project", role: e.role, hours: isFlat ? 0 : hours, unit: isFlat ? "flat" : "hrs", pay });
      });
      // Post-production entries — use editorBilling for photo editors
      p.postProduction.filter(c => c.crewMemberId === crewMemberId).forEach(e => {
        if (p.editorBilling && (e.role === "Photo Editor" || e.crewMemberId === crewMemberId)) {
          const rate = p.editorBilling?.perImageRate ?? 6;
          const imgs = p.editorBilling?.imageCount ?? 0;
          const isFinalized = p.editorBilling?.finalized === true || p.status === "editing_done" || p.status === "delivered";
          const pay = imgs * rate;
          if (imgs > 0) { totalPay += pay; totalImages += imgs; }
          breakdown.push({ projectId: p.id, date: p.date, typeName: pType?.name ?? "Project", role: e.role, hours: imgs, unit: "images", pay: isFinalized ? pay : 0 });
        } else {
          // Honor flat pay here too (post-production, non photo-editor).
          const isFlat = e.payType === "flat";
          const hours = Number(e.hoursWorked ?? 0);
          const pay = isFlat ? Number(e.flatAmount ?? 0) : hours * Number(e.payRatePerHour ?? 0);
          if (!isFlat) totalHours += hours;
          totalPay += pay;
          breakdown.push({ projectId: p.id, date: p.date, typeName: pType?.name ?? "Project", role: e.role, hours: isFlat ? 0 : hours, unit: isFlat ? "flat" : "hrs", pay });
        }
      });
    });

    return { totalHours, totalPay, totalImages, projectBreakdown: breakdown };
  }, [thisMonthProjects, data.projectTypes, crewMemberId]);

  // Count shoots vs edits this month
  const shootCount = thisMonthProjects.filter(p => p.crew.some(c => c.crewMemberId === crewMemberId)).length;
  const editCount = thisMonthProjects.filter(p => p.postProduction.some(c => c.crewMemberId === crewMemberId)).length;

  const crewMember = data.crewMembers.find(cm => cm.id === crewMemberId);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);


  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
        <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Welcome back{crewMember ? `, ${crewMember.name.split(" ")[0]}` : ""}
        </p>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-5">
        <StaffAgreementResign />
        {mySigned1099 && (
          <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border border-border bg-card/50 px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <FileSignature className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{mySigned1099.agreementTitle || "1099 agreement"}</p>
                <p className="text-xs text-muted-foreground">
                  Signed {mySigned1099.staffSignedAt ? new Date(mySigned1099.staffSignedAt).toLocaleDateString("en-US") : ""}
                  {mySigned1099.ownerSignedAt ? " · countersigned" : " · awaiting countersignature"}
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => setViewSigned1099(true)}>View</Button>
          </div>
        )}
        {mySigned1099 && (
          <SignedAgreementDialog
            open={viewSigned1099}
            onOpenChange={setViewSigned1099}
            agreement={mySigned1099}
            text={mySigned1099.agreementText || (mySigned1099.agreementVersion === currentAgreementVersion ? currentAgreementText : defaultAgreementText(orgName))}
            orgName={orgName}
            ownerName={orgName}
          />
        )}
        {/* Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard icon={CalendarDays} iconColor="text-blue-400" iconBg="bg-blue-500/20"
            label="Upcoming"
            value={String(upcomingProjects.length)}
            sub="Scheduled shoots"
            onClick={() => setExpandedSection(expandedSection === "upcoming" ? null : "upcoming")}
            active={expandedSection === "upcoming"}
          />
          <MetricCard icon={Briefcase} iconColor="text-purple-400" iconBg="bg-purple-500/20"
            label="This Month"
            value={String(thisMonthProjects.length)}
            sub={`${shootCount > 0 ? `${shootCount} shoot${shootCount !== 1 ? "s" : ""}` : ""}${shootCount > 0 && editCount > 0 ? " · " : ""}${editCount > 0 ? `${editCount} edit${editCount !== 1 ? "s" : ""}` : ""}`}
            onClick={() => setExpandedSection(expandedSection === "month" ? null : "month")}
            active={expandedSection === "month"}
          />
          {/* Year-to-date earnings, not hours. Flat-rate crew aren't paid by
              the hour, so hours were a number they're not measured on. */}
          <MetricCard icon={DollarSign} iconColor="text-cyan-400" iconBg="bg-cyan-500/20"
            label={`Earned in ${currentYear}`}
            value={formatCurrency(yearPay)}
            sub="Year to date"
          />
          <MetricCard icon={DollarSign} iconColor="text-green-400" iconBg="bg-green-500/20"
            label="Earnings"
            value={formatCurrency(totalPay)}
            sub="This month"
            onClick={() => setExpandedSection(expandedSection === "earnings" ? null : "earnings")}
            active={expandedSection === "earnings"}
          />
        </div>

        {/* Photo-editor work. Their next action isn't "post a draft for review",
            it's "upload the finished gallery" — so this leads with the jobs
            waiting on them and links straight to the project to do it. */}
        {(photoEditJobs.needsFinals.length > 0 || photoEditJobs.uploaded.length > 0) && (
          <div className="bg-card border border-border rounded-lg">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                <Film className="w-4 h-4 text-primary" /> Photos to edit
              </h3>
            </div>
            <div className="divide-y divide-border">
              {photoEditJobs.needsFinals.map(p => {
                const client = data.clients.find(c => c.id === p.clientId);
                const pType = data.projectTypes.find(t => t.id === p.projectTypeId);
                const loc = data.locations.find(l => l.id === p.locationId);
                const deliverables = (p.editTypes || []).map(id => data.editTypes.find(e => e.id === id)?.name).filter(Boolean).join(" + ");
                const hasSource = !!p.sourceFilesUrl || data.projectDocuments.some(d => d.projectId === p.id && d.kind === "source");
                return (
                  <div key={p.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                          {pType?.name || "Shoot"}{client ? ` · ${client.company}` : ""}
                        </div>
                        {deliverables && <p className="text-xs text-primary mt-0.5 truncate">{deliverables}</p>}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Shot {formatDate(p.date)}{loc ? ` · ${loc.name}` : ""}
                        </p>
                      </div>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-600 dark:text-amber-300 shrink-0">
                        Needs finals
                      </span>
                    </div>
                    {/* Both actions, always — she may need the RAWs again after
                        she's already uploaded once. */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {p.sourceFilesUrl ? (
                        <a href={p.sourceFilesUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-secondary text-foreground hover:bg-secondary/80">
                          <Download className="w-3.5 h-3.5" /> Download RAWs
                        </a>
                      ) : hasSource ? (
                        <Link href={`/calendar?project=${p.id}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-secondary text-foreground hover:bg-secondary/80">
                          <Download className="w-3.5 h-3.5" /> Download RAWs
                        </Link>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground border border-border">
                          <Download className="w-3.5 h-3.5" /> No RAWs yet
                        </span>
                      )}
                      <Link href={`/calendar?project=${p.id}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90">
                        <Upload className="w-3.5 h-3.5" /> Upload to gallery
                      </Link>
                    </div>
                  </div>
                );
              })}
              {photoEditJobs.uploaded.map(p => {
                const client = data.clients.find(c => c.id === p.clientId);
                const pType = data.projectTypes.find(t => t.id === p.projectTypeId);
                const gallery = data.deliveries.find(d => d.projectId === p.id);
                const count = gallery ? data.deliveryFiles.filter(f => f.deliveryId === gallery.id).length : 0;
                return (
                  <div key={p.id} className="px-4 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {pType?.name || "Shoot"}{client ? ` · ${client.company}` : ""}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{count} photo{count === 1 ? "" : "s"} uploaded</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-emerald-500/40 text-emerald-600 dark:text-emerald-300 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Done
                      </span>
                      {p.sourceFilesUrl && (
                        <a href={p.sourceFilesUrl} target="_blank" rel="noopener noreferrer"
                          className="text-[11px] text-primary hover:text-primary/80 inline-flex items-center gap-1">
                          <Download className="w-3 h-3" /> RAWs
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* The edit queue — first thing an editor sees, because it answers the
            three questions they'd otherwise text about: what's on me, did he
            watch it, what's settled. Hidden entirely for crew who don't edit. */}
        {(editJobs.needsCut.length > 0 || editJobs.inReview.length > 0 || editJobs.settled.length > 0) && (
          <div className="bg-card border border-border rounded-lg">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                <Film className="w-4 h-4 text-primary" /> Your edits
              </h3>
            </div>
            <div className="divide-y divide-border">
              {editJobs.needsCut.map(p => {
                const client = data.clients.find(c => c.id === p.clientId);
                const pType = data.projectTypes.find(t => t.id === p.projectTypeId);
                return (
                  <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{pType?.name || "Project"}{client ? ` · ${client.company}` : ""}</div>
                      {deliverablesFor(p) && (
                        <p className="text-xs text-primary mt-0.5 truncate">{deliverablesFor(p)}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">Shot {formatDate(p.date)} · no draft posted yet</p>
                      {briefFor(p) && (
                        <p className="text-[11px] text-muted-foreground/80 mt-1 line-clamp-2">{briefFor(p)}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-600 dark:text-amber-300">Needs a cut</span>
                      <PayChip {...payStateFor(p)} />
                    </div>
                  </div>
                );
              })}
              {editJobs.inReview.map(({ project: p, doc }) => {
                const client = data.clients.find(c => c.id === p.clientId);
                return (
                  <div key={doc.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">v{doc.version} · {doc.fileName}</div>
                      {deliverablesFor(p) && (
                        <p className="text-xs text-primary mt-0.5 truncate">{deliverablesFor(p)}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">{client?.company || "Project"} · sent {formatDate(doc.createdAt.slice(0, 10))}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-sky-500/40 text-sky-600 dark:text-sky-300">With {orgName || "the owner"}</span>
                      <PayChip {...payStateFor(p)} />
                    </div>
                  </div>
                );
              })}
              {editJobs.settled.map(({ project: p, doc }) => {
                const client = data.clients.find(c => c.id === p.clientId);
                const approved = doc.reviewStatus === "approved";
                return (
                  <div key={doc.id} className="px-4 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">v{doc.version} · {doc.fileName}</div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {client?.company || "Project"}
                        {!approved && doc.reviewNote ? ` · ${doc.reviewNote}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={cn(
                        "text-[10px] font-semibold px-1.5 py-0.5 rounded border inline-flex items-center gap-1",
                        approved ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-300" : "border-border text-muted-foreground",
                      )}>
                        {approved && <CheckCircle2 className="w-3 h-3" />}
                        {approved ? "Approved" : "Set aside"}
                      </span>
                      <PayChip {...payStateFor(p)} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Expanded Sections */}
        {expandedSection === "upcoming" && (
          <div className="bg-card border border-border rounded-lg">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Upcoming Shoots</h3>
            </div>
            <div className="divide-y divide-border max-h-80 overflow-auto">
              {upcomingProjects.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No upcoming shoots</div>
              ) : upcomingProjects.map(p => {
                const pType = data.projectTypes.find(t => t.id === p.projectTypeId);
                const loc = data.locations.find(l => l.id === p.locationId);
                const myRoles = [...p.crew.filter(c => c.crewMemberId === crewMemberId).map(c => c.role), ...p.postProduction.filter(c => c.crewMemberId === crewMemberId).map(c => c.role)];
                return (
                  <div key={p.id} className="px-4 py-3 flex items-start justify-between">
                    <div>
                      <span className="text-sm font-medium text-foreground">{pType?.name ?? "Project"}</span>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{p.startTime} — {p.endTime}</span>
                        {loc && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{loc.name}</span>}
                      </div>
                      {myRoles.length > 0 && <p className="text-xs text-primary/70 mt-1">{myRoles.join(", ")}</p>}
                    </div>
                    <span className="text-xs font-medium text-primary shrink-0">{formatDate(p.date)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {expandedSection === "month" && (
          <div className="bg-card border border-border rounded-lg">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{MONTH_NAMES[currentMonth]} Shoots</h3>
            </div>
            <div className="divide-y divide-border max-h-80 overflow-auto">
              {thisMonthProjects.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No shoots this month</div>
              ) : thisMonthProjects.map(p => {
                const pType = data.projectTypes.find(t => t.id === p.projectTypeId);
                const loc = data.locations.find(l => l.id === p.locationId);
                return (
                  <div key={p.id} className="px-4 py-3 flex items-start justify-between">
                    <div>
                      <span className="text-sm font-medium text-foreground">{pType?.name ?? "Project"}</span>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{p.startTime} — {p.endTime}</span>
                        {loc && <span>{loc.name}</span>}
                      </div>
                    </div>
                    <span className="text-xs font-medium text-primary shrink-0">{formatDate(p.date)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(expandedSection === "hours" || expandedSection === "earnings") && (
          <div className="bg-card border border-border rounded-lg">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {expandedSection === "hours" ? "Hours Breakdown" : "Earnings Breakdown"}
              </h3>
            </div>
            <div className="divide-y divide-border max-h-80 overflow-auto">
              {projectBreakdown.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No work logged this month</div>
              ) : (
                <>
                  {projectBreakdown.map((entry, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <span className="text-sm text-foreground">{entry.typeName}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">{formatDate(entry.date)}</span>
                          <span className="text-xs text-muted-foreground/60">{entry.role}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-foreground">{expandedSection === "hours" ? (entry.unit === "flat" ? "Flat rate" : `${entry.hours} ${entry.unit}`) : formatCurrency(entry.pay)}</p>
                      </div>
                    </div>
                  ))}
                  <div className="px-4 py-3 flex items-center justify-between bg-secondary/30">
                    <span className="text-sm font-semibold text-foreground">Total</span>
                    <span className="text-sm font-semibold text-primary">
                      {expandedSection === "hours" ? `${totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}h` : formatCurrency(totalPay)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Upcoming Schedule */}
          <div className="bg-card border border-border rounded-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Upcoming Schedule
              </h3>
              <Link href="/my-schedule" className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                Full Schedule <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {upcomingProjects.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No upcoming shoots</div>
              ) : (
                upcomingProjects.slice(0, 5).map(p => {
                  const pType = data.projectTypes.find(t => t.id === p.projectTypeId);
                  const loc = data.locations.find(l => l.id === p.locationId);
                  const myRoles = [
                    ...p.crew.filter(c => c.crewMemberId === crewMemberId).map(c => c.role),
                    ...p.postProduction.filter(c => c.crewMemberId === crewMemberId).map(c => c.role),
                  ];
                  return (
                    <div key={p.id} className="px-4 py-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{pType?.name ?? "Project"}</span>
                            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", STATUS_COLORS[p.status])}>
                              {STATUS_LABELS[p.status]}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{p.startTime} — {p.endTime}</span>
                            {loc && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{loc.name}</span>}
                          </div>
                          {myRoles.length > 0 && (
                            <p className="text-xs text-primary/70 mt-1">{myRoles.join(", ")}</p>
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

          {/* This Month's Pay Breakdown */}
          <div className="bg-card border border-border rounded-lg">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {MONTH_NAMES[currentMonth]} Earnings
              </h3>
            </div>
            <div className="divide-y divide-border">
              {projectBreakdown.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No work logged this month</div>
              ) : (
                <>
                  {projectBreakdown.map((entry, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <span className="text-sm text-foreground">{entry.typeName}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">{formatDate(entry.date)}</span>
                          <span className="text-xs text-muted-foreground/60">•</span>
                          <span className="text-xs text-muted-foreground">{entry.role}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-foreground">{formatCurrency(entry.pay)}</p>
                        <p className="text-[10px] text-muted-foreground">{entry.unit === "flat" ? "Flat rate" : `${entry.hours} ${entry.unit}`}</p>
                      </div>
                    </div>
                  ))}
                  <div className="px-4 py-3 flex items-center justify-between bg-secondary/30">
                    <span className="text-sm font-semibold text-foreground">Total</span>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-primary">{formatCurrency(totalPay)}</p>
                      <p className="text-[10px] text-muted-foreground">{totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}h</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

/** Where this job stands for the editor's own pay. Read-only on purpose —
 *  creating the invoice stays in My Invoices. */
function PayChip({ label, tone }: { label: string; tone: "paid" | "sent" | "none" }) {
  return (
    <span className={cn(
      "text-[10px] px-1.5 py-0.5 rounded border",
      tone === "paid" ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
        : tone === "sent" ? "border-sky-500/30 text-sky-600 dark:text-sky-400"
        : "border-border text-muted-foreground",
    )}>
      {label}
    </span>
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
