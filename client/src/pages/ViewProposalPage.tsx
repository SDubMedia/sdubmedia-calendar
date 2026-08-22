// ============================================================
// ViewProposalPage — Public page for client to review, sign, & pay
// No auth required — accessed via unique token link
// V2: Package selection → Agreement pages → Sign → Pay milestones
// ============================================================

import { Fragment, useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearch } from "wouter";
import { CheckCircle, AlertCircle, DollarSign, Check } from "lucide-react";
import { ProposalBlockRenderer } from "@/components/proposal/ProposalBlockRenderer";
import { clientFieldsIn } from "@/lib/mergeFieldPreview";


/** "845" → "8:45", "1230" → "12:30"; digits only, colon inserted for the
 *  last two. Reformats from raw digits on every keystroke so backspace
 *  behaves naturally. */
function formatTimeDigits(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, d.length - 2)}:${d.slice(-2)}`;
}

/**
 * Time entry as two controls — auto-colon text ("8:45") + an AM/PM select —
 * stored as one string ("8:45 AM") so the accept API's parseTimeText and
 * everything downstream stay unchanged. Native <input type="time"> is
 * banned (iOS WebKit width bugs, see CLAUDE.md); a select is the sanctioned
 * pattern. defaultMeridiem: coverage starts are usually AM, ends PM.
 */
function TimePartsInput({ value, onChange, defaultMeridiem, label }: {
  value: string;
  onChange: (v: string) => void;
  defaultMeridiem: "AM" | "PM";
  label: string;
}) {
  const m = value.match(/^(.*?)\s*(AM|PM)\.?$/i);
  const text = (m ? m[1] : value).trim();
  const storedMer = m ? (m[2].toUpperCase() as "AM" | "PM") : null;
  // Remembers an AM/PM choice made before any digits are typed (nothing is
  // stored until there's a time, so the stored string can't carry it yet).
  const [pickedMer, setPickedMer] = useState<"AM" | "PM" | null>(null);
  const mer = storedMer || pickedMer || defaultMeridiem;
  return (
    <div className="flex gap-1.5 min-w-0">
      <input
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(e) => {
          const t = formatTimeDigits(e.target.value);
          onChange(t ? `${t} ${mer}` : "");
        }}
        placeholder="8:30"
        aria-label={label}
        className={`w-full min-w-0 rounded border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 ${text ? "text-gray-900" : "text-gray-400"}`}
      />
      <select
        value={mer}
        onChange={(e) => {
          const mm = e.target.value as "AM" | "PM";
          setPickedMer(mm);
          if (text) onChange(`${text} ${mm}`);
        }}
        aria-label={`${label} AM or PM`}
        className="shrink-0 rounded border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

export default function ViewProposalPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const paidParam = searchParams.get("paid");
  const sessionIdParam = searchParams.get("session_id");
  // ?view=document re-opens the full proposal read-only AFTER acceptance,
  // so the client can reread and print/save the agreement they signed.
  const documentView = searchParams.get("view") === "document";

  const [loading, setLoading] = useState(true);
  const [proposal, setProposal] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  // Set when the proposal's expires_at has passed. Renders a dedicated
  // "link expired" screen instead of the live form.
  const [expired, setExpired] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paymentVerified, setPaymentVerified] = useState(false);
  // Public view token of the auto-generated paid invoice (set on verify).
  const [invoiceToken, setInvoiceToken] = useState("");
  const [verifyingPayment, setVerifyingPayment] = useState(false);

  // Package selection (V2)
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  // Multi-select: a client picks one film collection, then any number of
  // add-ons. The single field above still drives legacy single-package
  // proposals; this is what grouped templates use.
  const [selectedPackageIds, setSelectedPackageIds] = useState<string[]>([]);
  // What the signer types into the contract's blanks — their details and the
  // event. Filled here, shown live in the agreement above.
  const [clientFields, setClientFields] = useState<Record<string, string>>({});
  // Visible coverage-schedule rows (date + start + end each). Seeded from
  // prefilled event_date_N keys, or a legacy ISO event_date, after load.
  const [scheduleRows, setScheduleRows] = useState(1);
  const [showPartner, setShowPartner] = useState(false);
  const [partnerSignature, setPartnerSignature] = useState("");

  const [signatureType, setSignatureType] = useState<"typed" | "drawn">("typed");
  const [typedName, setTypedName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Owner preview (?preview=1): render exactly the client experience but
  // skip view tracking, so "Viewed" still means the CLIENT opened it.
  const isOwnerPreview = searchParams.get("preview") === "1";

  // Load proposal + track view
  useEffect(() => {
    if (!isOwnerPreview) fetch(`/api/proposal-view?token=${token}`).catch(() => {});

    fetch(`/api/proposal-accept?action=get&token=${token}`)
      .then(async r => ({ status: r.status, body: await r.json() }))
      .then(({ status, body }) => {
        if (body.error) {
          setError(body.error);
          if (status === 410 || body.expired) setExpired(true);
        } else {
          setProposal(body);
          setSignerEmail(body.clientEmail || "");
          // Hydrate with what's already known (owner-prefilled booking
          // details or a previous partial submit). Known fields render in
          // the agreement and are not asked for again; they round-trip
          // through the accept payload so they survive re-saves.
          if (body.clientFieldValues && typeof body.clientFieldValues === "object") {
            const cfv: Record<string, string> = { ...body.clientFieldValues };
            // Seed schedule row 1 from a legacy single ISO date if no
            // numbered rows exist yet.
            const rowNums = Object.keys(cfv)
              .map(k => k.match(/^event_date_(\d+)$/)?.[1])
              .filter(Boolean).map(Number);
            if (rowNums.length === 0 && /^\d{4}-\d{2}-\d{2}$/.test(cfv.event_date || "")) {
              cfv.event_date_1 = cfv.event_date;
            }
            setScheduleRows(Math.max(1, ...rowNums, 0) || 1);
            setClientFields(v => ({ ...cfv, ...v }));
          }
          if (body.alreadyAccepted) setAccepted(true);
          if (body.paidAt) setPaymentVerified(true);
          // Restore in-progress selections from localStorage if the client
          // closed the tab and came back. Server-stored selectedPackageId
          // (if set) takes precedence; only fall back to local draft when
          // nothing is committed yet. Lets the partner-review use case work
          // without losing picks.
          const draftKey = `slate.proposal-draft.${token}`;
          let restoredPackage: string | null = null;
          let restoredEmail: string | null = null;
          try {
            const raw = localStorage.getItem(draftKey);
            if (raw) {
              const draft = JSON.parse(raw);
              if (typeof draft.selectedPackageId === "string") restoredPackage = draft.selectedPackageId;
              if (Array.isArray(draft.selectedPackageIds)) setSelectedPackageIds(draft.selectedPackageIds);
              if (typeof draft.signerEmail === "string") restoredEmail = draft.signerEmail;
            }
          } catch { /* corrupt localStorage — ignore */ }

          // Committed group picks (accepted proposals) win over any local
          // draft — the document view renders exactly what was signed.
          if (Array.isArray(body.selectedPackageIds) && body.selectedPackageIds.length > 0) {
            setSelectedPackageIds(body.selectedPackageIds);
          }
          if (body.selectedPackageId) setSelectedPackageId(body.selectedPackageId);
          else if (restoredPackage && (body.packages || []).some((p: { id: string }) => p.id === restoredPackage)) {
            setSelectedPackageId(restoredPackage);
          }
          else if (body.packages?.length === 1) setSelectedPackageId(body.packages[0].id);

          if (restoredEmail && !body.clientEmail) setSignerEmail(restoredEmail);
        }
        setLoading(false);
      })
      .catch(() => { setError("Failed to load proposal"); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Persist in-progress selections to localStorage so closing the tab
  // doesn't lose them. Cleared on successful submit. Skipped while loading
  // so the initial-load setSelectedPackageId() doesn't overwrite a future
  // restore. Per-token key isolates drafts across multiple proposals.
  useEffect(() => {
    if (loading || !token) return;
    if (accepted) return; // don't save after submit
    const draftKey = `slate.proposal-draft.${token}`;
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        selectedPackageId,
        selectedPackageIds,
        signerEmail,
        savedAt: Date.now(),
      }));
    } catch { /* private mode / quota — ignore */ }
  }, [loading, token, accepted, selectedPackageId, selectedPackageIds, signerEmail]);

  // Verify payment on return from Stripe
  useEffect(() => {
    if (paidParam === "true" && sessionIdParam && token && !paymentVerified) {
      setVerifyingPayment(true);
      fetch(`/api/proposal-accept?action=verify-payment&token=${token}&sessionId=${sessionIdParam}`)
        .then(r => r.json())
        .then(data => {
          if (data.paid) {
            setPaymentVerified(true);
            setAccepted(true);
            if (typeof data.invoiceToken === "string" && data.invoiceToken) setInvoiceToken(data.invoiceToken);
          }
          setVerifyingPayment(false);
        })
        .catch(() => setVerifyingPayment(false));
    }
  }, [paidParam, sessionIdParam, token, paymentVerified]);

  // Canvas drawing
  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ("touches" in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ("touches" in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath(); ctx.moveTo(x, y);
  }, []);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ("touches" in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ("touches" in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#000000";
    ctx.lineTo(x, y); ctx.stroke();
  }, [isDrawing]);

  const stopDraw = useCallback(() => setIsDrawing(false), []);

  async function handleAccept() {
    if (!typedName.trim() && signatureType === "typed") return;
    if (!signerEmail.trim()) return;

    let signatureData: string;
    if (signatureType === "typed") {
      signatureData = typedName.trim();
    } else {
      const canvas = canvasRef.current;
      if (!canvas) return;
      signatureData = canvas.toDataURL("image/png");
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/proposal-accept?action=accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          selectedPackageId,
          selectedPackageIds,
          clientFields,
          additionalSignature: showPartner && partnerSignature.trim()
            ? { name: (clientFields.partner_name || "").trim(), email: (clientFields.partner_email || "").trim(), typedName: partnerSignature.trim() }
            : null,
          signature: { name: typedName.trim() || "Client", email: signerEmail, signatureData, signatureType },
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      // Submit succeeded — drop the localStorage draft so a future visit
      // doesn't try to restore stale selections.
      try { localStorage.removeItem(`slate.proposal-draft.${token}`); } catch { /* ignore */ }

      if (result.paymentRequired && result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      if (result.paymentRequired && result.paymentError) {
        setError(result.paymentError);
        setAccepted(true);
        return;
      }
      setAccepted(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ---- STATES ----

  if (loading || verifyingPayment) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">{verifyingPayment ? "Verifying payment..." : "Loading proposal..."}</p>
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">This link has expired</h1>
          <p className="text-gray-500">
            For security, this proposal link is no longer active. Please reach out to the sender to request a fresh link.
          </p>
        </div>
      </div>
    );
  }

  if (error && !proposal) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Proposal Unavailable</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if ((accepted || paymentVerified) && !documentView) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {paymentVerified ? "Proposal Accepted & Paid!" : "Proposal Accepted!"}
          </h1>
          <p className="text-gray-500">
            {paymentVerified
              ? "Thank you! Your payment has been received."
              : "Thank you for accepting. We'll be in touch shortly."}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            {paymentVerified && invoiceToken && (
              <a
                href={`/invoice/${invoiceToken}`}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >View your invoice</a>
            )}
            <a
              href={`/proposal/${token}?view=document`}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >View the signed agreement</a>
          </div>
          {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
        </div>
      </div>
    );
  }

  /** Add or remove a service. A "pick one" group swaps the choice rather than
   *  accumulating — otherwise a client could buy two full collections by
   *  clicking twice, and the total would be quietly wrong. */
  function togglePackageInGroup(packageId: string, group: { selection: "single" | "multiple"; packageIds: string[] }) {
    setSelectedPackageIds(prev => {
      const already = prev.includes(packageId);
      if (already) return prev.filter(id => id !== packageId);
      if (group.selection === "single") {
        // Drop anything else from THIS group, leave other groups alone.
        return [...prev.filter(id => !group.packageIds.includes(id)), packageId];
      }
      return [...prev, packageId];
    });
  }

  // ---- MAIN VIEW ----
  const packages = proposal?.packages || [];
  const hasPackages = packages.length > 0;
  const selectedPkg = hasPackages ? packages.find((p: any) => p.id === selectedPackageId) : null;

  // Everything the client has ticked across all groups, priced from the
  // library. Grouped selections win when present; a single-package proposal
  // still totals the old way.
  const libraryPackages: any[] = proposal?.libraryPackages || [];
  const groupChosen = libraryPackages.filter(p => selectedPackageIds.includes(p.id));
  const groupTotal = groupChosen.reduce((sum, p) => sum + (p.defaultPrice || 0), 0);

  // Which groups the client still has to answer. Named so the button can say
  // WHICH one is missing — "choose an option" is a maddening error when a
  // proposal has three groups.
  const allGroups: any[] = (proposal?.pages || [])
    .flatMap((pg: any) => (pg.blocks || []))
    .filter((b: any) => b.type === "package_group");
  const unmetRequired = allGroups.filter((g: any) =>
    g.requirement === "required" && !g.packageIds.some((id: string) => selectedPackageIds.includes(id)));
  const hasGroups = allGroups.length > 0;

  // When the proposal offers service groups, THEY are the price — full stop.
  //
  // A template converted to groups can still carry its old single package.
  // The wedding template does: one $10,100 package alongside the three
  // pickers. The client was shown a $10,100 bill and a "Sign & Pay $5,050"
  // button before choosing anything, and picking services didn't change
  // either figure until the first tick. Whatever they chose, they were
  // charged the legacy total.
  //
  // So with groups present the legacy package contributes nothing: no line
  // items, no total. Nothing selected means $0, which is the truth.
  const lineItems = hasGroups ? [] : (selectedPkg?.lineItems || proposal?.lineItems || []);
  const total = hasGroups
    ? groupTotal
    : (selectedPkg?.totalPrice || proposal?.total || 0);
  const milestones = selectedPkg?.paymentMilestones || [];

  // Legacy payment config fallback
  const paymentConfig = proposal?.paymentConfig || { option: "none" };
  const hasMilestones = milestones.length > 0;
  const firstMilestone = milestones.find((m: any) => m.dueType === "at_signing");
  const paymentAmount = hasMilestones && firstMilestone
    ? (firstMilestone.type === "percent" ? total * (firstMilestone.percent || 0) / 100 : firstMilestone.fixedAmount || 0)
    : paymentConfig.option === "full" ? total
    : paymentConfig.option === "deposit" ? Math.round(total * (paymentConfig.depositPercent / 100) * 100) / 100
    : 0;

  /** The vendor's own details, so the agreement prints "S-Dub Media" and a
   *  real address instead of boxes labelled "Vendor Name". The public payload
   *  carries a whitelisted copy of Settings → Business Info; there's no
   *  AppContext out here. */
  const publicOrg = proposal
    ? ({ name: proposal.orgName, businessInfo: proposal.orgBusinessInfo || {} } as any)
    : null;

  // Agreement pages
  // Every page, in the order they were authored. This used to filter to
  // agreement + custom, which silently dropped invoice and payment pages: you
  // could add them to a template and they simply never appeared, so there was
  // no way to check what the client would see before sending.
  /** A page with nothing on it printed "No content yet." to the client — an
   *  author's note in a customer's document. Invoice and payment pages build
   *  themselves from the selections, so an empty one is still meaningful. */
  const pageHasSomething = (p: any) =>
    p?.type === "invoice" || p?.type === "payment"
      || (p?.blocks || []).length > 0 || !!(p?.content || "").trim();

  const agreementPages = [...(proposal?.pages || [])]
    // An empty agreement page is the placeholder for the linked contract, so
    // it stays; anything else blank goes.
    .filter((p: any) => (p.type === "agreement" && proposal?.agreementPreview) || pageHasSomething(p))
    .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const hasPages = agreementPages.length > 0;

  /** Everything the agreement needs to read as a finished document rather
   *  than a template: the vendor's details, what the client has ticked (which
   *  also decides the conditional clauses), what they've typed, and the total
   *  the payment terms are a percentage of. Shared so the six places an
   *  agreement can appear can't drift apart. */
  const agreementProps = {
    resolveMerge: true,
    org: publicOrg,
    total,
    selectedPackageIds,
    filledFields: clientFields,
    onFieldEdit: (field: string, value: string) =>
      setClientFields(v => ({ ...v, [field]: value })),
  } as const;

  // Every blank the agreement asks the CLIENT to fill, gathered from the
  // pages and from the linked contract. Derived from the text itself, so a
  // template that adds a field automatically asks for it.
  const contractText: string = [
    ...(agreementPages || []).flatMap((pg: any) => [
      pg.content || "",
      ...((pg.blocks || []).map((b: any) => (b.type === "prose" ? b.html : "")) as string[]),
    ]),
    proposal?.agreementPreview?.content || "",
    ...(((proposal?.agreementPreview?.pages || []) as any[]).flatMap((pg: any) => [
      pg.content || "",
      ...((pg.blocks || []).map((b: any) => (b.type === "prose" ? b.html : "")) as string[]),
    ])),
    proposal?.contractContent || "",
  ].join(" ");
  // What the agreement itself asks for.
  const fromContract = clientFieldsIn(contractText);

  // Plus the booking details, always. A proposal is for a job on a date at a
  // place — Geoff's agreement doesn't happen to reference them, and without
  // this there was nowhere to say when or where the wedding is.
  // Structured venue fields, in the order the cursor should travel: name,
  // address, city/state, zip. Tab order follows DOM order, so this list IS
  // the tab flow. A legacy single event_location value (older proposals)
  // satisfies all four.
  // Venue fields only — coverage dates/times are the repeating schedule
  // rows below (event_date_1 / event_start_time_1 / event_end_time_1, _2…).
  // A contract that references {{event_date}} still asks for it via
  // fromContract, so wedding agreements keep their single date field.
  const ALWAYS: { field: string; label: string }[] = [
    { field: "event_venue_name", label: "Event Name" },
    { field: "event_address", label: "Event Address" },
    { field: "event_city_state", label: "Event City and State" },
    { field: "event_zip", label: "Event Zip Code" },
  ];
  const legacyLocationKnown = !!String((proposal?.clientFieldValues || {}).event_location || "").trim();
  // Fields the owner pre-filled on the proposal are already answered: a
  // corporate offsite's dates are known when the proposal is written, and
  // asking the client to re-type them (into a single-date input that can't
  // even hold "October 9-10") read as a wedding form. When everything is
  // pre-known, the whole "Your details" panel (second-person offer included)
  // disappears.
  // Owner-prefilled values are not hidden — they render prefilled and
  // editable so the client VERIFIES them (Geoff, 2026-08-22: "I want them to
  // confirm the event address and the dates/times"). Only a legacy combined
  // event_location value suppresses the structured venue fields.
  const VENUE_FIELDS = ["event_venue_name", "event_address", "event_city_state", "event_zip"];
  const requiredClientFields = [
    ...fromContract.filter(f => !f.field.startsWith("partner_")),
    ...ALWAYS.filter(a => !fromContract.some(f => f.field === a.field)),
  ].filter(f => !(legacyLocationKnown && VENUE_FIELDS.includes(f.field)));

  // The second person is optional to add, but once added their name is
  // needed — half a set of details is worse than none. Not always a fiancé:
  // often a parent, so the wording stays neutral.
  const partnerFields = [
    { field: "partner_name", label: "Full name" },
    { field: "partner_email", label: "Email" },
    { field: "partner_phone", label: "Phone" },
  ];
  // Schedule validation: row 1 must be complete; any partially-filled extra
  // row must be completed too (a date without times is not a schedule).
  const missingSchedule: { field: string; label: string }[] = [];
  for (let i = 1; i <= scheduleRows; i++) {
    const d = (clientFields[`event_date_${i}`] || "").trim();
    const st = (clientFields[`event_start_time_${i}`] || "").trim();
    const en = (clientFields[`event_end_time_${i}`] || "").trim();
    const anyFilled = !!(d || st || en);
    if (i === 1 || anyFilled) {
      if (!d) missingSchedule.push({ field: `event_date_${i}`, label: `Date ${i}` });
      if (!st) missingSchedule.push({ field: `event_start_time_${i}`, label: `Start time (day ${i})` });
      if (!en) missingSchedule.push({ field: `event_end_time_${i}`, label: `End time (day ${i})` });
    }
  }
  const missingClientFields = [
    ...requiredClientFields.filter(f => !(clientFields[f.field] || "").trim()),
    ...missingSchedule,
    ...(showPartner && !(clientFields.partner_name || "").trim()
      ? [{ field: "partner_name", label: "Second person's full name" }]
      : []),
    ...(showPartner && !partnerSignature.trim()
      ? [{ field: "partner_signature", label: "Second person's signature" }]
      : []),
  ];

  // Rendered between the introduction and the agreement, not down at the
  // signature. Asking first means the contract they then read is already
  // filled in — they see a finished document with their date and venue in it,
  // rather than a page of empty boxes they complete afterwards and never
  // re-read. It also front-loads the only typing in the whole flow.
  // Rendered whenever unsigned: coverage dates/times are always required,
  // so hiding the panel when the venue fields happen to be pre-known would
  // leave signing permanently blocked with no visible inputs.
  const yourDetailsPanel = !accepted ? (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-1">Confirm your details</h2>
      <p className="text-sm text-gray-500 mb-4">
        Please verify the event details below and fill in anything missing — correct anything that's off before signing.
      </p>
      <div className="grid gap-3 sm:grid-cols-2" data-section="venue-and-contract-fields">
        {requiredClientFields.map(f => (
          <div key={f.field}>
            <label className="block text-[11px] uppercase tracking-wider text-gray-500 mb-1">
              {f.label} <span className="text-red-600">*</span>
            </label>
            <input
              type={f.field === "event_date" && /^(\d{4}-\d{2}-\d{2})?$/.test(clientFields.event_date || "") ? "date" : f.field.endsWith("_email") ? "email" : "text"}
              inputMode={f.field.endsWith("_zip") ? "numeric" : undefined}
              value={clientFields[f.field] || ""}
              onChange={(e) => setClientFields(v => ({ ...v, [f.field]: e.target.value }))}
              className={`w-full rounded border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 ${(clientFields[f.field] || "").trim() ? "text-gray-900" : "text-gray-400"}`}
              placeholder={f.label}
            />
          </div>
        ))}
      </div>

      {/* Coverage schedule: one row per day (date + start + end side by
          side), Add date for multi-day events. Sits below the venue block
          by design (Geoff, 2026-08-22). */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Coverage dates and times</h3>
        <div className="space-y-2">
          {Array.from({ length: scheduleRows }, (_, idx) => idx + 1).map(i => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="min-w-0">
                <label className="block text-[11px] uppercase tracking-wider text-gray-500 mb-1">Event Date {scheduleRows > 1 ? i : ""} <span className="text-red-600">*</span></label>
                <input
                  type="date"
                  value={clientFields[`event_date_${i}`] || ""}
                  onChange={(e) => setClientFields(v => ({ ...v, [`event_date_${i}`]: e.target.value }))}
                  className={`w-full min-w-0 max-w-full rounded border border-gray-300 px-3 py-2 text-sm ${clientFields[`event_date_${i}`] ? "text-gray-900" : "text-gray-400"}`}
                />
              </div>
              <div className="min-w-0">
                <label className="block text-[11px] uppercase tracking-wider text-gray-500 mb-1">Start Time <span className="text-red-600">*</span></label>
                <TimePartsInput
                  value={clientFields[`event_start_time_${i}`] || ""}
                  onChange={(v) => setClientFields(prev => ({ ...prev, [`event_start_time_${i}`]: v }))}
                  defaultMeridiem="AM"
                  label={`Start time day ${i}`}
                />
              </div>
              <div className="min-w-0">
                <label className="block text-[11px] uppercase tracking-wider text-gray-500 mb-1">End Time <span className="text-red-600">*</span></label>
                <TimePartsInput
                  value={clientFields[`event_end_time_${i}`] || ""}
                  onChange={(v) => setClientFields(prev => ({ ...prev, [`event_end_time_${i}`]: v }))}
                  defaultMeridiem="PM"
                  label={`End time day ${i}`}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-4">
          <button
            type="button"
            onClick={() => setScheduleRows(n => n + 1)}
            className="text-sm text-blue-600 hover:text-blue-700"
          >+ Add date</button>
          {scheduleRows > 1 && (
            <button
              type="button"
              onClick={() => {
                setClientFields(v => {
                  const next = { ...v };
                  delete next[`event_date_${scheduleRows}`];
                  delete next[`event_start_time_${scheduleRows}`];
                  delete next[`event_end_time_${scheduleRows}`];
                  return next;
                });
                setScheduleRows(n => Math.max(1, n - 1));
              }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >Remove last date</button>
          )}
        </div>
      </div>
      {/* Weddings usually have two people on the agreement, and it isn't
          always a couple — sometimes a parent is paying. Only offered when
          there IS an agreement to co-sign: a proposal without a contract
          (corporate bookings) has nothing for a second person to sign, and
          the partner/fiance wording read wrong there (Geoff, 2026-08-22). */}
      {!!(proposal?.agreementPreview || (proposal?.contractContent || "").trim()) && (
      <div className="mt-4 pt-4 border-t border-gray-200">
        {!showPartner ? (
          <button
            type="button"
            onClick={() => setShowPartner(true)}
            className="text-sm text-blue-600 hover:text-blue-700"
          >+ Add a second person (partner, fiancé or parent)</button>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-900">Second person</h3>
              <button
                type="button"
                onClick={() => { setShowPartner(false); setClientFields(v => ({ ...v, partner_name: "", partner_email: "", partner_phone: "" })); }}
                className="text-xs text-gray-500 hover:text-gray-700"
              >Remove</button>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              They'll sign the agreement as well, so their name goes on it alongside yours.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {partnerFields.map(f => (
                <div key={f.field}>
                  <label className="block text-[11px] uppercase tracking-wider text-gray-500 mb-1">
                    {f.label}{f.field === "partner_name" && <span className="text-red-600"> *</span>}
                  </label>
                  <input
                    type={f.field.endsWith("_email") ? "email" : "text"}
                    value={clientFields[f.field] || ""}
                    onChange={(e) => setClientFields(v => ({ ...v, [f.field]: e.target.value }))}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                    placeholder={f.label}
                  />
                </div>
              ))}
            </div>

            {/* Both parties are named on the agreement, so both sign it.
                Typed rather than drawn: the second person is often on a
                different device, or reading over a shoulder, and a typed
                signature is the same option already offered to the first. */}
            <div className="mt-3">
              <label className="block text-[11px] uppercase tracking-wider text-gray-500 mb-1">
                Their signature — type their full name <span className="text-red-600">*</span>
              </label>
              <input
                value={partnerSignature}
                onChange={(e) => setPartnerSignature(e.target.value)}
                placeholder="Full name"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                style={{ fontFamily: "'Brush Script MT', cursive", fontSize: "1.1rem" }}
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Typing their name counts as their signature on this agreement.
              </p>
            </div>
          </>
        )}
      </div>
      )}

      {missingClientFields.length > 0 && (
        <p className="text-xs text-amber-700 mt-3">
          Still needed: {missingClientFields.map(f => f.label).join(", ")}.
        </p>
      )}
    </div>
  ) : null;



  // Branding extracted once per render — header + footer both consume it.
  const orgLogo: string = proposal?.orgLogo || "";
  const orgBI: Record<string, string> = proposal?.orgBusinessInfo || {};
  const orgAddressLine = [orgBI.address, orgBI.city, orgBI.state, orgBI.zip].filter(Boolean).join(", ");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Branded header — logo if set, otherwise the company name */}
      <div className="bg-white border-b px-6 py-5">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          {orgLogo ? (
            <img src={orgLogo} alt={proposal?.orgName || ""} className="h-10 w-auto object-contain" />
          ) : null}
          <div className="min-w-0">
            <p className="text-sm text-gray-500">{proposal?.orgName || "Proposal"}</p>
            <h1 className="text-lg font-bold text-gray-900 truncate">{proposal?.title}</h1>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">

        {/* ---- PACKAGE SELECTION ---- */}
        {hasPackages && !hasGroups && packages.length > 1 && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Choose Your Package</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {packages.map((pkg: any) => (
                <button
                  key={pkg.id}
                  onClick={() => setSelectedPackageId(pkg.id)}
                  className={`text-left p-5 rounded-xl border-2 transition-all ${
                    selectedPackageId === pkg.id
                      ? "border-blue-500 bg-blue-50 shadow-md"
                      : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-base font-bold text-gray-900">{pkg.name}</h3>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      selectedPackageId === pkg.id ? "border-blue-500 bg-blue-500" : "border-gray-300"
                    }`}>
                      {selectedPackageId === pkg.id && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </div>
                  {pkg.description && <p className="text-sm text-gray-500 mb-3">{pkg.description}</p>}
                  <div className="space-y-1 mb-3">
                    {pkg.lineItems?.map((li: any) => (
                      <p key={li.id || li.description} className="text-xs text-gray-600">- {li.description}</p>
                    ))}
                  </div>
                  <p className="text-xl font-bold text-gray-900 font-mono">${pkg.totalPrice?.toFixed(2)}</p>
                  {pkg.paymentMilestones?.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      {pkg.paymentMilestones.length} payment{pkg.paymentMilestones.length !== 1 ? "s" : ""}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Single package or legacy services display */}
        {!hasGroups && (!hasPackages || packages.length === 1) && lineItems.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              {hasPackages && selectedPkg ? selectedPkg.name : "Services"}
            </h2>
            {hasPackages && selectedPkg?.description && (
              <p className="text-sm text-gray-500 mb-4">{selectedPkg.description}</p>
            )}
            <div className="divide-y divide-gray-100">
              {lineItems.map((li: any) => (
                <div key={li.id || li.description} className="py-3 flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{li.description}</p>
                    {li.details && <p className="text-xs text-gray-500 mt-0.5">{li.details}</p>}
                    {li.quantity > 1 && <p className="text-xs text-gray-400 mt-0.5">{li.quantity} x ${Number(li.unitPrice).toFixed(2)}</p>}
                  </div>
                  <p className="text-sm font-semibold text-gray-900 font-mono">${(li.quantity * li.unitPrice).toFixed(2)}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-200 mt-2 pt-3 flex justify-between">
              <span className="text-sm font-bold text-gray-900">Total</span>
              <span className="text-lg font-bold text-gray-900 font-mono">${total.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* ---- PAYMENT SCHEDULE (milestones) ---- */}
        {hasMilestones && selectedPackageId && !hasGroups && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Payment Schedule</h2>
            <div className="space-y-3">
              {milestones.map((ms: any, idx: number) => {
                const amount = ms.type === "percent" ? total * (ms.percent || 0) / 100 : ms.fixedAmount || 0;
                return (
                  <div key={ms.id || idx} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full border-2 border-gray-300 flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{ms.label}</p>
                      <p className="text-xs text-gray-400">
                        {ms.dueType === "at_signing" ? "Due at signing" : ms.dueType === "relative_days" ? `Due ${ms.dueDays} days after signing` : ms.dueDate ? `Due ${ms.dueDate}` : ""}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 font-mono">${amount.toFixed(2)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ---- AGREEMENT PAGES (V2 multi-page) ----
             Each page renders via ProposalBlockRenderer, which uses page.blocks
             when present and falls back to sanitized page.content for legacy
             templates. Fixes the original rendering bug where raw HTML tags
             were displayed as text in a whitespace-pre-wrap div. */}
        {hasPages && agreementPages.map((page: any, pageIdx: number) => (
          <Fragment key={page.id}>
          {/* Just before the agreement — the last moment it's still "getting
              ready to read the contract" rather than an interruption. */}
          {page.type === "agreement"
            && agreementPages.findIndex((p: any) => p.type === "agreement") === pageIdx
            && yourDetailsPanel}
          <div className="space-y-2">
            {/* The page's own name. It used to fall back to "Agreement",
                which labelled a client's first page — their Introduction —
                with a word the owner never typed. No label, no heading. */}
            {(page.label || page.type === "invoice" || page.type === "payment") && (
              <h2 className="text-lg font-bold text-gray-900 px-2">
                {page.label || (page.type === "invoice" ? "Invoice" : "Payment")}
              </h2>
            )}
            {/* Invoice and payment pages are generated from what the client
                actually chose rather than authored block by block — an invoice
                typed by hand goes stale the moment a package price changes. */}
            {page.type === "invoice" ? (
              <div className="bg-white rounded-xl shadow-md border border-border overflow-hidden">
                <div className="px-8 sm:px-16 py-12 space-y-4 text-gray-800">
                  {groupChosen.length === 0 ? (
                    <p className="text-sm text-gray-500">Nothing selected yet — choose your services above and they'll be itemised here.</p>
                  ) : (
                    <>
                      <ul className="divide-y divide-gray-100">
                        {groupChosen.map((pkg: any) => (
                          <li key={pkg.id} className="flex items-baseline justify-between gap-4 py-3">
                            <span className="text-sm text-gray-800">{pkg.name}</span>
                            <span className="text-sm tabular-nums">${(pkg.defaultPrice || 0).toLocaleString()}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="flex items-baseline justify-between pt-4 border-t border-gray-300">
                        <span className="text-sm font-semibold">Total</span>
                        <span className="text-lg font-semibold tabular-nums">${groupTotal.toLocaleString()}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : page.type === "payment" ? (
              <div className="bg-white rounded-xl shadow-md border border-border overflow-hidden">
                <div className="px-8 sm:px-16 py-12 space-y-3 text-gray-800">
                  {milestones.length === 0 ? (
                    <p className="text-sm text-gray-500">Payment terms appear here once they're set on the template.</p>
                  ) : (
                    milestones.map((m: any, i: number) => (
                      <div key={m.id || i} className="flex items-baseline justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
                        <span className="text-sm">{m.label}</span>
                        <span className="text-sm tabular-nums">
                          {m.type === "percent"
                            ? `${m.percent}%${total ? ` · $${Math.round(total * (m.percent || 0) / 100).toLocaleString()}` : ""}`
                            : `$${(m.fixedAmount || 0).toLocaleString()}`}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : page.type === "agreement" && proposal?.agreementPreview && !(page.blocks || []).length && !page.content ? (
              // An empty agreement page is a placeholder for the contract you
              // linked — so the contract appears HERE, in the agreement
              // section where you put it, rather than tacked on at the end.
              (proposal.agreementPreview.pages || []).length > 0 ? (
                (proposal.agreementPreview.pages as any[])
                  .filter(pageHasSomething)
                  .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                  .map((cp: any) => (
                    <ProposalBlockRenderer {...agreementProps} key={cp.id} page={cp} libraryPackages={proposal?.libraryPackages || []} />
                  ))
              ) : (
                <ProposalBlockRenderer {...agreementProps}
                  page={{ id: "linked-agreement", type: "agreement", label: "", content: proposal.agreementPreview.content, sortOrder: 0 }}
                  libraryPackages={proposal?.libraryPackages || []}
                />
              )
            ) : (
              <ProposalBlockRenderer {...agreementProps}
                page={page}
                libraryPackages={proposal?.libraryPackages || []}
                onTogglePackage={togglePackageInGroup}
              />
            )}
          </div>
          </Fragment>
        ))}

        {/* ---- THE LINKED AGREEMENT ----
             Read-only, so the client can read the contract BEFORE signing
             instead of it only existing as a generated document afterwards.
             The binding copy is still the one produced on acceptance with
             merge fields resolved; this is the same wording, unfilled. */}
        {proposal?.agreementPreview
          && !agreementPages.some((p: any) => p.type === "agreement" && !(p.blocks || []).length && !p.content) && (
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-gray-900 px-2">{proposal.agreementPreview.label}</h2>
            {(proposal.agreementPreview.pages || []).length > 0 ? (
              (proposal.agreementPreview.pages as any[])
                .filter(pageHasSomething)
                .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                .map((page: any) => (
                  <ProposalBlockRenderer {...agreementProps}
                    key={page.id}
                    page={page}
                    libraryPackages={proposal?.libraryPackages || []}
                  />
                ))
            ) : proposal.agreementPreview.content ? (
              <ProposalBlockRenderer {...agreementProps}
                page={{
                  id: "agreement-preview",
                  type: "agreement",
                  label: proposal.agreementPreview.label,
                  content: proposal.agreementPreview.content,
                  sortOrder: 0,
                }}
                libraryPackages={proposal?.libraryPackages || []}
              />
            ) : (
              <div className="bg-white rounded-xl border border-border px-8 py-10 text-sm text-gray-500">
                This agreement template has no content yet.
              </div>
            )}
          </div>
        )}

        {/* Fallback: legacy contractContent (proposal has no pages array yet) */}
        {!hasPages && proposal?.contractContent && (
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-gray-900 px-2">Agreement</h2>
            <ProposalBlockRenderer {...agreementProps}
              page={{
                id: "legacy",
                type: "agreement",
                label: "Agreement",
                content: proposal.contractContent,
                sortOrder: 0,
              }}
              libraryPackages={proposal?.libraryPackages || []}
            />
          </div>
        )}

        {/* No agreement page to sit in front of — show it here rather than
            never asking. */}
        {!agreementPages.some((p: any) => p.type === "agreement") && yourDetailsPanel}

        {/* ---- CONFIRMED EVENT DETAILS (part of the signed record) ----
            The agreement prose may not reference these via merge fields, so
            the details the client confirmed at signing are printed on the
            document itself — venue, coverage schedule, PO. Without this the
            signed record never showed what was agreed to. */}
        {accepted && (() => {
          const cfv: Record<string, string> = (proposal?.clientFieldValues && typeof proposal.clientFieldValues === "object") ? proposal.clientFieldValues : {};
          const val = (k: string) => String(cfv[k] || "").trim();
          const fmtDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso)
            ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
            : iso;
          const days = Object.keys(cfv)
            .map(k => k.match(/^event_date_(\d+)$/))
            .filter((m): m is RegExpMatchArray => !!m)
            .map(m => Number(m[1]))
            .sort((a, b) => a - b)
            .map(n => ({ date: val(`event_date_${n}`), start: val(`event_start_time_${n}`), end: val(`event_end_time_${n}`) }))
            .filter(d => d.date);
          if (days.length === 0 && val("event_date")) days.push({ date: val("event_date"), start: val("event_start_time"), end: val("event_end_time") });
          const venueLines = [
            val("event_venue_name"),
            val("event_address"),
            [val("event_city_state"), val("event_zip")].filter(Boolean).join(" "),
          ].filter(Boolean);
          const legacyLoc = val("event_location");
          const po = val("po_number");
          if (days.length === 0 && venueLines.length === 0 && !legacyLoc && !po) return null;
          return (
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-3">Confirmed Event Details</h2>
              <div className="grid gap-4 sm:grid-cols-2 text-sm">
                {(venueLines.length > 0 || legacyLoc) && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Location</p>
                    {legacyLoc ? <p className="text-gray-900">{legacyLoc}</p>
                      : venueLines.map((l, i) => <p key={i} className="text-gray-900">{l}</p>)}
                  </div>
                )}
                {days.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Coverage</p>
                    {days.map((d, i) => (
                      <p key={i} className="text-gray-900">
                        {fmtDate(d.date)}{d.start ? ` · ${d.start}${d.end ? ` – ${d.end}` : ""}` : ""}
                      </p>
                    ))}
                  </div>
                )}
                {po && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">PO / Reference</p>
                    <p className="text-gray-900">{po}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ---- SIGNED RECORD (document view after acceptance) ---- */}
        {accepted && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Signed &amp; Accepted</h2>
            <p className="text-sm text-gray-600">
              Signed by <strong>{proposal?.clientSignature?.name || "the client"}</strong>
              {proposal?.clientSignature?.email ? ` (${proposal.clientSignature.email})` : ""}
              {proposal?.acceptedAt ? ` on ${new Date(proposal.acceptedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}` : ""}.
              {proposal?.paidAt ? " Paid in full." : ""}
            </p>
            {proposal?.clientSignature?.signatureType === "typed" && proposal?.clientSignature?.name && (
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 text-center mt-3">
                <p className="text-2xl italic text-gray-900" style={{ fontFamily: "cursive" }}>{proposal.clientSignature.name}</p>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 mt-1">Client</p>
              </div>
            )}
            {/* Countersignature: once the owner signs, the client's copy is a
                fully-executed two-signature document. */}
            {proposal?.ownerSignature?.name && (
              <>
                <p className="text-sm text-gray-600 mt-4">
                  Countersigned by <strong>{proposal.ownerSignature.name}</strong>
                  {proposal.ownerSignature.timestamp ? ` on ${new Date(proposal.ownerSignature.timestamp).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}` : ""}.
                </p>
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 text-center mt-2">
                  {proposal.ownerSignature.signatureType === "drawn" && String(proposal.ownerSignature.signatureData || "").startsWith("data:image") ? (
                    <img src={proposal.ownerSignature.signatureData} alt="Countersignature" className="max-h-16 mx-auto" />
                  ) : (
                    <p className="text-2xl italic text-gray-900" style={{ fontFamily: "cursive" }}>{proposal.ownerSignature.name}</p>
                  )}
                  <p className="text-[11px] uppercase tracking-wider text-gray-400 mt-1">{proposal?.orgName || "Provider"}</p>
                </div>
              </>
            )}
            <button
              onClick={() => window.print()}
              className="mt-4 inline-flex items-center justify-center rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 print:hidden"
            >Print / Save as PDF</button>
          </div>
        )}

        {/* ---- SIGN & ACCEPT ---- */}
        {!accepted && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            {paymentAmount > 0 ? "Sign & Pay" : "Accept Proposal"}
          </h2>

          {hasPackages && !selectedPackageId && packages.length > 1 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-amber-700">Please select a package above before signing.</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-500 block mb-1">Your Full Name</label>
              <input value={typedName} onChange={e => setTypedName(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-gray-900" placeholder="Full legal name" />
            </div>
            <div>
              <label className="text-sm text-gray-500 block mb-1">Your Email</label>
              <input value={signerEmail} onChange={e => setSignerEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-gray-900" placeholder="email@example.com" />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setSignatureType("typed")} className={`flex-1 py-2 rounded-lg border text-sm font-medium ${signatureType === "typed" ? "border-blue-500 bg-blue-50 text-blue-600" : "border-gray-200 text-gray-500"}`}>
                Type Signature
              </button>
              <button onClick={() => setSignatureType("drawn")} className={`flex-1 py-2 rounded-lg border text-sm font-medium ${signatureType === "drawn" ? "border-blue-500 bg-blue-50 text-blue-600" : "border-gray-200 text-gray-500"}`}>
                Draw Signature
              </button>
            </div>

            {signatureType === "typed" ? (
              typedName && (
                <div className="border border-gray-200 rounded-lg p-6 bg-gray-50 text-center">
                  <p className="text-3xl italic text-gray-900" style={{ fontFamily: "cursive" }}>{typedName}</p>
                </div>
              )
            ) : (
              <div>
                <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
                  <canvas ref={canvasRef} width={600} height={150} className="w-full cursor-crosshair touch-none"
                    onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
                    onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
                </div>
                <button onClick={() => { const c = canvasRef.current; if (c) c.getContext("2d")?.clearRect(0, 0, c.width, c.height); }} className="text-xs text-gray-400 mt-1 hover:text-gray-600">Clear</button>
              </div>
            )}

            <p className="text-xs text-gray-400">
              By clicking below, you agree this constitutes your legal electronic signature and you accept the services and terms above.
            </p>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              onClick={handleAccept}
              disabled={submitting || (!typedName.trim() && signatureType === "typed") || !signerEmail.trim() || (hasPackages && packages.length > 1 && !selectedPackageId) || missingClientFields.length > 0 || unmetRequired.length > 0}
              title={
                missingClientFields.length > 0
                  ? `Fill in: ${missingClientFields.map(f => f.label).join(", ")}`
                  : unmetRequired.length > 0
                    ? "Choose from the required service groups above"
                    : ""
              }
              className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? "Processing..." : (
                <>
                  {paymentAmount > 0 && <DollarSign className="w-4 h-4" />}
                  {paymentAmount > 0 ? `Sign & Pay $${paymentAmount.toFixed(2)}` : "Accept Proposal"}
                </>
              )}
            </button>
          </div>
        </div>
        )}
      </div>

      {/* Business info footer — clients see the contractor's company name,
          address, phone, and email instead of just "Powered by Slate". */}
      <div className="border-t border-gray-200 mt-6">
        <div className="max-w-3xl mx-auto px-6 py-5 text-center text-xs text-gray-500 space-y-1">
          {proposal?.orgName && (
            <p className="font-semibold text-gray-700">{proposal.orgName}</p>
          )}
          {orgAddressLine && <p>{orgAddressLine}</p>}
          <p>
            {orgBI.phone && <span>{orgBI.phone}</span>}
            {orgBI.phone && orgBI.email && <span className="mx-1.5">·</span>}
            {orgBI.email && <span>{orgBI.email}</span>}
          </p>
          <p className="text-gray-300 pt-2">Powered by Slate</p>
        </div>
      </div>
    </div>
  );
}
